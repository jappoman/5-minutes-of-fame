import * as cdk from "aws-cdk-lib";
import { FameStack } from "../lib/fame-stack";

const app = new cdk.App();
new FameStack(app, "FiveMinutesDev", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "eu-west-1" }
});
