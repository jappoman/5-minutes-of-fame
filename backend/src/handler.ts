import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const reply = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body)
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  switch (event.rawPath) {
    case "/health": return reply(200, { ok: true, service: "five-minutes-of-fame" });
    case "/stage": return reply(200, { status: "idle", speaker: null, remainingSeconds: null });
    default: return reply(404, { message: "Not found" });
  }
}
