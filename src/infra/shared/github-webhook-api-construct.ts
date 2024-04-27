import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { GenerateUUID } from './generate-uuid';

export interface GithubWebhookAPIProps {
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly buildSpecPath: string;
}

export class GithubWebhookAPI extends Construct {
  constructor(scope: Construct, id: string, props: GithubWebhookAPIProps) {
    super(scope, id);

    const githubSecretUUID = new GenerateUUID(this, 'GithubSecretUUID').node.defaultChild as cdk.CustomResource;
    const githubSecretUUIDValue = githubSecretUUID.getAtt('uuid').toString();

    new cdk.CfnOutput(this, 'Payload Secret', {
      value: githubSecretUUIDValue,
    });

    const codeBuildClientDeploymentRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    const codeBuildProject = new codebuild.Project(this, 'CodeBuild', {
      projectName: 'codeBuild',
      buildSpec: codebuild.BuildSpec.fromSourceFilename(props.buildSpecPath),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.DOCKER_LAYER),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      environmentVariables: {
        BRANCH_NAME: {
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          value: 'Value will come from triggering lambda'
        }
      },
      role: codeBuildClientDeploymentRole,
      source: codebuild.Source.gitHub({
        owner: props.githubOrg,
        repo: props.githubRepo
      })
    });

    const handlerRole = new iam.Role(this, 'generator-lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildAdminAccess')
      ],
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
      functionName: 'githubHandler',
      code: lambda.Code.fromAsset('./src/infra/lambda/github_webhook_api'),
      handler: 'index.handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      role: handlerRole,
      environment: {
        branchPrefix: '^(feat|bug|hotfix)-',
        githubSecretUUIDValue,
        // activeEnvKey: TRCdk.activeEnvKey || '',
        codeBuildProjectName: codeBuildProject.projectName,
        // pipelineStackName: `a${assetId}-${appName}-pipeline-BRANCH_NAME-${shortRegion}-${envSuffix}`
      },
      memorySize: 1024,
      timeout: cdk.Duration.minutes(1),
    });

    const githubWebhookApiGateway = new apigateway.RestApi(this, `${id}-ApiGateway`, {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    new cdk.CfnOutput(this, 'Payload URL', {
      value: `https://${githubWebhookApiGateway.restApiId}.execute-api.us-east-1.amazonaws.com/prod/webhook`,
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(githubHandler, {
      proxy: true,
    });

    // Add endpoint
    const webhooksResource = githubWebhookApiGateway.root.addResource('webhook');
    webhooksResource.addMethod('POST', lambdaIntegration);
  }
}