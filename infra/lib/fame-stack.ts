import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";

export class FameStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const site = new s3.Bucket(this, "Site", { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const origin = origins.S3BucketOrigin.withOriginAccessControl(site);
    const distribution = new cf.Distribution(this, "Cdn", { defaultBehavior: { origin, viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS }, defaultRootObject: "index.html", errorResponses: [{ httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.minutes(1) }] });
    const people = new dynamodb.Table(this, "People", { partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING }, sortKey: { name: "sk", type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const fn = new nodejs.NodejsFunction(this, "ApiLambda", { entry: path.join(__dirname, "../../backend/src/handler.ts"), handler: "handler", runtime: lambda.Runtime.NODEJS_22_X, memorySize: 128, timeout: cdk.Duration.seconds(10), environment: { TABLE_NAME: people.tableName } });
    people.grantReadWriteData(fn);
    const api = new apigw.HttpApi(this, "Api", { corsPreflight: { allowOrigins: ["*"], allowMethods: [apigw.CorsHttpMethod.GET] } });
    api.addRoutes({ path: "/health", methods: [apigw.HttpMethod.GET], integration: new integrations.HttpLambdaIntegration("Health", fn) });
    api.addRoutes({ path: "/stage", methods: [apigw.HttpMethod.GET], integration: new integrations.HttpLambdaIntegration("Stage", fn) });
    new cdk.CfnOutput(this, "FrontendBucket", { value: site.bucketName });
    new cdk.CfnOutput(this, "CloudFrontDistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "SiteUrl", { value: "https://" + distribution.distributionDomainName });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.url! });
  }
}
