import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { IvsClient, CreateStreamKeyCommand, DeleteStreamKeyCommand, StopStreamCommand } from "@aws-sdk/client-ivs";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { randomUUID } from "node:crypto";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ivs = new IVSClient({});
const scheduler = new SchedulerClient({});
const table = process.env.TABLE_NAME!;
const channelArn = process.env.IVS_CHANNEL_ARN!;
const playbackUrl = process.env.IVS_PLAYBACK_URL!;
const ingestEndpoint = process.env.IVS_INGEST_ENDPOINT!;
const now = () => Date.now();
const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const key = (user: string) => ({ pk: "USER#" + user, sk: "PROFILE" });
const stageKey = { pk: "STAGE", sk: "CURRENT" };
const error = (status: number, message: string) => json(status, { error: message });

type Profile = { pk: string; sk: string; userId: string; verified?: boolean; consumed?: boolean; queued?: boolean; claims?: Record<string, { value: string; verified: boolean }>; };
type Stage = { userId?: string; endsAt?: number; startsAt?: number; streamKeyArn?: string; display?: Record<string, string>; status?: string };

async function getProfile(id: string): Promise<Profile | undefined> {
  return (await db.send(new GetCommand({ TableName: table, Key: key(id), ConsistentRead: true }))).Item as Profile | undefined;
}
async function getStage(): Promise<Stage> {
  return ((await db.send(new GetCommand({ TableName: table, Key: stageKey, ConsistentRead: true }))).Item ?? {}) as Stage;
}
function publicStage(stage: Stage) {
  const live = stage.status === "live" && !!stage.endsAt && stage.endsAt > now();
  return { status: live ? "live" : "idle", remainingSeconds: live ? Math.max(0, Math.ceil((stage.endsAt! - now()) / 1000)) : null, endsAt: live ? stage.endsAt : null, speaker: live ? { claims: stage.display ?? {} } : null, playbackUrl: live ? playbackUrl : null };
}
async function endStage(stage: Stage) {
  if (!stage.userId) return;
  try { await ivs.send(new StopStreamCommand({ channelArn })); } catch (e) { console.warn("stop stream returned an error", (e as Error).name); }
  if (stage.streamKeyArn) {
    try { await ivs.send(new DeleteStreamKeyCommand({ arn: stage.streamKeyArn })); } catch (e) { console.warn("revoke key returned an error", (e as Error).name); }
  }
  await db.send(new UpdateCommand({ TableName: table, Key: stageKey, UpdateExpression: "SET #s = :idle REMOVE userId, startsAt, endsAt, display, streamKeyArn", ConditionExpression: "userId = :uid", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":idle": "idle", ":uid": stage.userId } })).catch(() => undefined);
}
async function expireIfNeeded() {
  const stage = await getStage();
  if (stage.status === "live" && stage.endsAt && stage.endsAt <= now()) await endStage(stage);
}
function identity(event: APIGatewayProxyEventV2): string | undefined {
  const claims = ((event.requestContext as unknown as { authorizer?: unknown }).authorizer as { jwt?: { claims?: Record<string, unknown> } } | undefined)?.jwt?.claims;
  return typeof claims?.sub === "string" ? claims.sub : undefined;
}
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath;
  try {
    if (path === "/health") return json(200, { ok: true });
    if (path === "/stage") return json(200, publicStage(await getStage()));
    const user = identity(event);
    if (!user) return error(401, "Authentication required");
    if (path === "/me" && event.requestContext.http.method === "GET") {
      const profile = await getProfile(user);
      return json(200, { verified: profile?.verified === true, consumed: profile?.consumed === true, queued: profile?.queued === true, claims: Object.fromEntries(Object.entries(profile?.claims ?? {}).map(([k, v]) => [k, { verified: v.verified, value: v.value }])) });
    }
    if (path === "/queue" && event.requestContext.http.method === "POST") {
      const profile = await getProfile(user);
      if (!profile?.verified) return error(403, "Identity verification required");
      if (profile.consumed) return error(409, "Your lifetime turn has already been used");
      if (profile.queued) return error(409, "Already queued");
      const queuedAt = new Date().toISOString() + "#" + randomUUID();
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Update: { TableName: table, Key: key(user), UpdateExpression: "SET queued = :t", ConditionExpression: "verified = :t AND (attribute_not_exists(consumed) OR consumed = :f) AND (attribute_not_exists(queued) OR queued = :f)", ExpressionAttributeValues: { ":t": true, ":f": false } } },
        { Put: { TableName: table, Item: { pk: "QUEUE", sk: queuedAt, userId: user }, ConditionExpression: "attribute_not_exists(pk)" } }
      ] }));
      return json(202, { queued: true });
    }
    if (path === "/queue" && event.requestContext.http.method === "DELETE") {
      const entries = await db.send(new QueryCommand({ TableName: table, KeyConditionExpression: "pk = :q", ExpressionAttributeValues: { ":q": "QUEUE" }, Limit: 100 }));
      const item = entries.Items?.find(i => i.userId === user);
      if (!item) return error(404, "Not queued");
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Delete: { TableName: table, Key: { pk: item.pk, sk: item.sk }, ConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": user } } },
        { Update: { TableName: table, Key: key(user), UpdateExpression: "SET queued = :f", ExpressionAttributeValues: { ":f": false } } }
      ] }));
      return json(200, { queued: false });
    }
    if (path === "/go-live" && event.requestContext.http.method === "POST") {
      await expireIfNeeded();
      const profile = await getProfile(user);
      if (!profile?.verified || profile.consumed || !profile.queued) return error(403, "Not eligible");
      const first = (await db.send(new QueryCommand({ TableName: table, KeyConditionExpression: "pk = :q", ExpressionAttributeValues: { ":q": "QUEUE" }, Limit: 1, ConsistentRead: true }))).Items?.[0];
      if (!first || first.userId !== user) return error(409, "Wait for your turn");
      const payload = JSON.parse(event.body ?? "{}") as { show?: string[] };
      if (!Array.isArray(payload.show) || payload.show.length > 20 || !payload.show.every(s => typeof s === "string" && /^[a-zA-Z]{1,30}$/.test(s))) return error(400, "Invalid disclosure selection");
      const display: Record<string, string> = {};
      for (const field of new Set(payload.show)) {
        const claim = profile.claims?.[field];
        if (!claim?.verified) return error(400, "Unverified disclosure: " + field);
        display[field] = claim.value;
      }
      const started = now();
      const end = started + 300000;
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Update: { TableName: table, Key: stageKey, UpdateExpression: "SET #s = :live, userId = :u, startsAt = :start, endsAt = :end, display = :display", ConditionExpression: "attribute_not_exists(userId) AND (attribute_not_exists(#s) OR #s = :idle)", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":live": "live", ":idle": "idle", ":u": user, ":start": started, ":end": end, ":display": display } } },
        { Update: { TableName: table, Key: key(user), UpdateExpression: "SET consumed = :t, queued = :f", ConditionExpression: "verified = :t AND queued = :t AND (attribute_not_exists(consumed) OR consumed = :f)", ExpressionAttributeValues: { ":t": true, ":f": false } } },
        { Delete: { TableName: table, Key: { pk: first.pk, sk: first.sk }, ConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": user } } }
      ] }));
      try {
        const streamKey = await ivs.send(new CreateStreamKeyCommand({ channelArn }));
        if (!streamKey.streamKey?.value || !streamKey.streamKey.arn) throw new Error("Missing stream key");
        await db.send(new UpdateCommand({ TableName: table, Key: stageKey, UpdateExpression: "SET streamKeyArn = :arn", ConditionExpression: "userId = :u AND endsAt = :end", ExpressionAttributeValues: { ":arn": streamKey.streamKey.arn, ":u": user, ":end": end } }));
        await scheduler.send(new CreateScheduleCommand({ Name: "five-minutes-" + randomUUID(), ScheduleExpression: "at(" + new Date(end).toISOString().replace(/\.\d{3}Z$/, "") + ")", ScheduleExpressionTimezone: "UTC", FlexibleTimeWindow: { Mode: "OFF" }, Target: { Arn: process.env.EXPIRY_FUNCTION_ARN!, RoleArn: process.env.SCHEDULER_ROLE_ARN!, Input: JSON.stringify({ action: "expire", userId: user, endsAt: end }) }, ActionAfterCompletion: "DELETE" }));
        return json(200, { ingestEndpoint, streamKey: streamKey.streamKey.value, endsAt: end });
      } catch (e) {
        await endStage(await getStage());
        console.error("Live setup failed", (e as Error).name);
        return error(503, "Broadcast setup failed; entitlement has been consumed, contact support");
      }
    }
    if (path === "/stop" && event.requestContext.http.method === "POST") {
      const stage = await getStage();
      if (stage.userId !== user) return error(403, "Not your broadcast");
      await endStage(stage);
      return json(200, { stopped: true });
    }
    return error(404, "Not found");
  } catch (e) {
    console.error("Request error", (e as Error).name);
    return error(409, "Request could not be completed");
  }
}
export async function expire(event: { action?: string; userId?: string; endsAt?: number }) {
  if (event.action !== "expire" || !event.userId || !event.endsAt) return;
  const stage = await getStage();
  if (stage.userId === event.userId && stage.endsAt === event.endsAt && stage.endsAt <= now()) await endStage(stage);
}
