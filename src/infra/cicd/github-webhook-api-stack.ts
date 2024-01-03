import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class GithubWebhookAPIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']

    const handlerRole = new iam.Role(this, 'generator-lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: `${id}-lambda-role`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ]
    });

    handlerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:PutParameter',
          'ssm:DeleteParameter',
          'ssm:GetParameter',
          'iam:PassRole',
          'secretsmanager:GetSecretValue',
          'codepipeline:CreatePipeline',
          'codepipeline:DeletePipeline',
          'codepipeline:ListPipelines',
          'codepipeline:GetPipeline',
          'codepipeline:UpdatePipeline',
          'codestar-connections:PassConnection',
        ],
        resources: ['*'],
      }),
    );

    // Create a lambda function that can act as a handler for API Gateway requests
    const githubHandler = new lambda.Function(this, 'githubWebhookApiHandler', {
      code: lambda.Code.fromAsset('./src/infra/lambdas/github_webhook_api'),
      handler: 'github_webhook.handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      role: handlerRole,
      environment: {
        pipelineTemplate: 'Pipeline-cicd',
        branchPrefix: '^(feature|bug|hotfix)-',
        featurePipelineSuffix: '-FeatureBranchPipeline',
        devAccount: accounts['DEV_ACCOUNT_ID']
      },
      memorySize: 1024,
      timeout: cdk.Duration.minutes(1),
    });

    new cdk.CfnOutput(this, `${id}-github-webhook-api-handler-lambda-arn`, {
      value: githubHandler.functionArn,
      exportName: `${id}-github-webhook-api-handler-lambda-arn`,
    });

    const logGroup = new logs.LogGroup(this, 'Github-Webhook-API-Logs');
    const deployOptions: apigateway.StageOptions = {
      accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
      accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
        caller: false,
        httpMethod: true,
        ip: true,
        protocol: true,
        requestTime: true,
        resourcePath: true,
        responseLength: true,
        status: true,
        user: true,
      }),
      metricsEnabled: true,
    };

    const githubWebhookApiGateway = new apigateway.RestApi(this, `${id}-api-gateway`, {
      deployOptions,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    new cdk.CfnOutput(this, `${id}-api-gateway-domain-arn`, {
      value: `${githubWebhookApiGateway.arnForExecuteApi()}`,
      exportName: `${id}-api-gateway-domain-arn`,
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(githubHandler, {
      proxy: true,
    });

    // Add endpoint
    const webhooksResource = githubWebhookApiGateway.root.addResource('webhook');

    webhooksResource.addMethod('POST', lambdaIntegration);
  }
}
