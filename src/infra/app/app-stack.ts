import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Trigger } from 'aws-cdk-lib/triggers';
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct';


const path = require('node:path');

export interface NextjsAppStackProps {
  branchName: string;
  useRdsDataBase?: boolean | false;
}


export class NextjsAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NextjsAppStackProps, stackProps?: cdk.StackProps) {
    super(scope, id, stackProps);

    const config: any = this.node.tryGetContext('config') || {};
    const resourceAttr = config['resourceAttr'] || {};
    const authSecretName = resourceAttr['authSecretName'] || '';

    const authSecret = new sm.Secret(this, 'AuthSecret', {
      secretName: `${props.branchName}-${authSecretName}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ config: '' }),
        generateStringKey: 'base64EcodedConfig',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    const lambdaAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'LambdaAdapterLayerX86',
      `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerX86:3`
    );

    const nextCdkFunction = new lambda.Function(this, 'NextCdkFunction', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'run.sh',
      code: lambda.Code.fromAsset(path.join(
        __dirname,
        '../../client_nextjs/.next/',
        'standalone')
      ),
      architecture: lambda.Architecture.X86_64,
      environment: {
        'AWS_LAMBDA_EXEC_WRAPPER': '/opt/bootstrap',
        'RUST_LOG': 'info',
        'PORT': '8080',
      },
      layers: [lambdaAdapterLayer],
    });

    const api = new apiGateway.RestApi(this, "api", {
      defaultCorsPreflightOptions: {
        allowOrigins: apiGateway.Cors.ALL_ORIGINS,
        allowMethods: apiGateway.Cors.ALL_METHODS
      }
    });

    const nextCdkFunctionIntegration = new apiGateway.LambdaIntegration(
      nextCdkFunction,
      {
        allowTestInvoke: false
      }
    );
    api.root.addMethod('ANY', nextCdkFunctionIntegration);

    api.root.addProxy({
      defaultIntegration: new apiGateway.LambdaIntegration(nextCdkFunction, {
        allowTestInvoke: false
      }),
      anyMethod: true,
    });

    const nextBucket = new s3.Bucket(this, 'next-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true
    });

    new cdk.CfnOutput(this, 'Next bucket', { value: nextBucket.bucketName });

    const policyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:GetFunction',
            'lambda:UpdateFunctionCode',
          ],
          resources: ['*'],
        }),
      ],
    });

    const cloudfrontAuthPolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:GetResourcePolicy',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:ListSecretVersionIds',
          ],
          resources: [authSecret.secretArn],
        }),
      ],
    });

    const cloudfrontReadOnlyAccessPolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'acm:ListCertificates',
            'cloudfront:DescribeFunction',
            'cloudfront:Get*',
            'cloudfront:List*',
            'iam:ListServerCertificates',
            'route53:List*',
            'waf:ListWebACLs',
            'waf:GetWebACL',
            'wafv2:ListWebACLs',
            'wafv2:GetWebACL',
          ],
          resources: ['*'],
        }),
      ],
    });

    const lambdaReadOnlyAccessPolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'cloudformation:DescribeStacks',
            'cloudformation:ListStackResources',
            'cloudwatch:GetMetricData',
            'cloudwatch:ListMetrics',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSubnets',
            'ec2:DescribeVpcs',
            'kms:ListAliases',
            'iam:GetPolicy',
            'iam:GetPolicyVersion',
            'iam:GetRole',
            'iam:GetRolePolicy',
            'iam:ListAttachedRolePolicies',
            'iam:ListRolePolicies',
            'iam:ListRoles',
            'logs:DescribeLogGroups',
            'lambda:Get*',
            'lambda:List*',
            'states:DescribeStateMachine',
            'states:ListStateMachines',
            'tag:GetResources',
            'xray:GetTraceSummaries',
            'xray:BatchGetTraces',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'logs:DescribeLogStreams',
            'logs:GetLogEvents',
            'logs:FilterLogEvents',
          ],
          resources: ['arn:aws:logs:*:*:log-group:/aws/lambda/*'],
        }),
      ],
    });

    const lambdaBasicExecutionRolePolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
        }),
      ],
    });

    const cloudfrontAuthRole = new iam.Role(this, 'CloudfrontAuthRole', {
      assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('lambda.amazonaws.com'), new iam.ServicePrincipal('edgelambda.amazonaws.com')),
      inlinePolicies: {
        cloudfrontAuthPolicyDocument: cloudfrontAuthPolicyDocument,
        cloudfrontReadOnlyAccessPolicyDocument: cloudfrontReadOnlyAccessPolicyDocument,
        lambdaReadOnlyAccessPolicyDocument: lambdaReadOnlyAccessPolicyDocument,
        lambdaBasicExecutionRolePolicyDocument: lambdaBasicExecutionRolePolicyDocument,
        policyDocument: policyDocument,
      },
    });

    const cloudfrontAuthFunction = new lambdaNodeJs.NodejsFunction(this, 'CloudfrontAuthFunction', {
      entry: require.resolve('../lambda/app/auth'),
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5)
    });

    cdk.Tags.of(cloudfrontAuthFunction).add('secretId', `${props.branchName}-${authSecretName}`);

    const version = cloudfrontAuthFunction.currentVersion;
    const alias = new lambda.Alias(this, 'LambdaAlias', { aliasName: 'Current', version });

    const cloudfrontDistribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.RestApiOrigin(api, {
          customHeaders: {
            secretId: `${props.branchName}-${authSecretName}`
          }
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        edgeLambdas: [{
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: alias.version,
          includeBody: false,
        }],
      },
      additionalBehaviors: {
        '_next/static/*': {
          origin: new origins.S3Origin(nextBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        },
        'static/*': {
          origin: new origins.S3Origin(nextBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        },
      },
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
      // logBucket: nextLoggingBucket,
      // logFilePrefix: 'cloudfront-access-logs',
    });

    new cdk.CfnOutput(this, 'CloudFront URL', {
      value: `https://${cloudfrontDistribution.distributionDomainName}`
    });

    new s3deploy.BucketDeployment(this, 'deploy-next-static-bucket', {
      sources: [s3deploy.Source.asset('./src/client_nextjs/.next/static/')],
      destinationBucket: nextBucket,
      destinationKeyPrefix: '_next/static',
      distribution: cloudfrontDistribution,
      distributionPaths: ['/_next/static/*']
    });

    new s3deploy.BucketDeployment(this, 'deploy-next-public-bucket', {
      sources: [s3deploy.Source.asset('./src/client_nextjs/public/static/')],
      destinationBucket: nextBucket,
      destinationKeyPrefix: 'static',
      distribution: cloudfrontDistribution,
      distributionPaths: ['/static/*']
    });

    if (props!.useRdsDataBase) {
      const databaseSecret = sm.Secret.fromSecretCompleteArn(this, 'databaseSecret', cdk.Fn.importValue(resourceAttr['databaseSecretArn']));
      const vpcId = ssm.StringParameter.valueFromLookup(this, resourceAttr['databaseVpcId']);
      const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId });
      const securityGroupId = ssm.StringParameter.valueFromLookup(this, resourceAttr['migrationRunnerSecurityGroupId']);
      const securityGroup = ec2.SecurityGroup.fromLookupById(this, 'securityGroupId', securityGroupId);

      const conn: DatabaseConnectionProps = {
        host: databaseSecret.secretValueFromJson('host').toString(),
        port: databaseSecret.secretValueFromJson('port').toString(),
        engine: databaseSecret.secretValueFromJson('engine').toString(),
        username: databaseSecret.secretValueFromJson('username').toString(),
        password: databaseSecret.secretValueFromJson('password').toString(),
      };

      const migrationRunner = new DockerPrismaFunction(this, 'DockerMigrationRunner', {
        code: lambda.DockerImageCode.fromImageAsset(
          './src/infra/lambda/prisma', {
          cmd: ['migration-runner.handler'],
          platform: Platform.LINUX_AMD64,
        }),
        memorySize: 256,
        timeout: cdk.Duration.minutes(1),
        vpc,
        securityGroups: [securityGroup],
        conn,
      });

      // run database migration during CDK deployment
      new Trigger(this, 'MigrationTrigger', {
        handler: migrationRunner,
      });
    }
  }
}
