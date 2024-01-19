import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Trigger } from 'aws-cdk-lib/triggers';
import { Construct } from 'constructs';
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct';

export interface AppStackProps {
  useRdsDataBase?: boolean | false;
}

export class AppStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly cfnOutCloudFrontUrl: cdk.CfnOutput;
  public readonly cfnOutBucketName: cdk.CfnOutput;
  public readonly cfnOutBucketArn: cdk.CfnOutput;
  public readonly cfnOutDistributionId: cdk.CfnOutput;
  public readonly restApi: apigateway.LambdaRestApi;
  public readonly cfnOutApiImagesUrl: cdk.CfnOutput;
  public readonly cfnOutApiLikesUrl: cdk.CfnOutput;

  constructor(scope: Construct,
    id: string,
    props?: AppStackProps,
    stackProps?: cdk.StackProps) {
    super(scope, id, stackProps);

    const config: any = this.node.tryGetContext('config') || {};
    const accounts = config.accounts || {};
    const currentAcct = cdk.Stack.of(this).account;
    const resourceAttr = config['resourceAttr'] || {};
    const webhookAPILambdaRole = resourceAttr['webhookAPILambdaRole'] || '';
    let frontEndCodeBuildStepRole = resourceAttr['frontEndCodeBuildStepRole'];
    frontEndCodeBuildStepRole = currentAcct == accounts.DEV_ACCOUNT_ID ? frontEndCodeBuildStepRole : `${frontEndCodeBuildStepRole}-main`;

    // Remediating AwsSolutions-S10 by enforcing SSL on the bucket.
    this.bucket = new s3.Bucket(this, 'Bucket', {
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:PutObjectAcl',
        ],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          StringEquals: {
            'aws:PrincipalAccount': accounts.CICD_ACCOUNT_ID,
          },
        },
        effect: iam.Effect.ALLOW,
        resources: [`${this.bucket.bucketArn}/*`],
      }),
    );

    /**
     * CloudFront Distribution and lambda edge
     */

    const authSecret = sm.Secret.fromSecretCompleteArn(this, 'AuthSecret', cdk.Fn.importValue('CloudfrontAuthSecretArn'));

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
      entry: require.resolve('../lambda/app/auth/auth.js'),
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5)
    });

    const version = cloudfrontAuthFunction.currentVersion;
    const alias = new lambda.Alias(this, 'LambdaAlias', { aliasName: 'Current', version });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(this.bucket, {
          originPath: '/frontend',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [{
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: alias.version,
          includeBody: false,
        }],
      },
      additionalBehaviors: {
        '/uploads/*': {
          origin: new cloudfrontOrigins.S3Origin(this.bucket, {
            originPath: '/',
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    this.cfnOutCloudFrontUrl = new cdk.CfnOutput(this, 'CfnOutCloudFrontUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'URL for CLOUDFRONT_URL in `frontend/.env` file',
    });

    this.cfnOutDistributionId = new cdk.CfnOutput(this, 'CfnOutDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution Id',
    });

    this.cfnOutBucketName = new cdk.CfnOutput(this, 'CfnOutBucketName', {
      value: this.bucket.bucketName,
      description: 'Website Hosting Bucket Name',
    });

    this.cfnOutBucketArn = new cdk.CfnOutput(this, 'cfnOutBucketArn', {
      value: this.bucket.bucketArn,
      description: 'Website Hosting Bucket Name',
    });

    const likesTable = new dynamo.Table(this, 'LikesTable', {
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'imageKeyS3',
        type: dynamo.AttributeType.STRING,
      },
    });

    let lambdaApiHandlerPublic = new lambdaNodeJs.NodejsFunction(this, 'ApiHandlerPublic', {
      entry: require.resolve('../lambda/app/coffee-listing-api-public'),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        BUCKER_UPLOAD_FOLDER_NAME: 'uploads',
      },
    });

    this.bucket.grantReadWrite(lambdaApiHandlerPublic);

    let lambdaApiHandlerPrivate = new lambdaNodeJs.NodejsFunction(this, 'ApiHandlerPrivate', {
      entry: require.resolve('../lambda/app/coffee-listing-api-private'),
      environment: {
        DYNAMODB_TABLE_LIKES_NAME: likesTable.tableName,
      },
    });

    lambdaApiHandlerPrivate.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query', 'dynamodb:UpdateItem'],
        resources: [likesTable.tableArn],
      }),
    );

    let restApi = new apigateway.LambdaRestApi(this, 'RestApi', {
      handler: lambdaApiHandlerPublic,
      proxy: false,
    });

    let apiImages = restApi.root.addResource('images', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    apiImages.addMethod('GET');
    apiImages.addMethod('POST');

    let apiLikes = restApi.root.addResource('likes', {
      defaultIntegration: new apigateway.LambdaIntegration(lambdaApiHandlerPrivate),
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    apiLikes.addMethod('POST');

    let apiLikesImage = apiLikes.addResource('{imageKeyS3}');
    apiLikesImage.addMethod('GET');

    this.restApi = restApi;

    this.cfnOutApiLikesUrl = new cdk.CfnOutput(this, 'CfnOutApiLikesUrl', {
      value: restApi.urlForPath('/likes'),
      description: 'Likes API URL for `frontend/.env` file',
    });

    this.cfnOutApiImagesUrl = new cdk.CfnOutput(this, 'CfnOutApiImagesUrl', {
      value: restApi.urlForPath('/images'),
      description: 'Images API URL for `frontend/.env` file',
    });

    // CICD pipeline will assume this role to perform the follwoing actions
    // 1- Delete app stack when feature branch is deleted
    // 2- Push the client artifacts to dev/prod s3 bucket
    // 3- invalidate CloudFront cache in dev/prod accounts
    new iam.Role(this, 'adminRoleFromCicdAccount', {
      roleName: resourceAttr['adminRoleFromCicdAccount'],
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(`arn:aws:iam::${accounts.CICD_ACCOUNT_ID}:role/${webhookAPILambdaRole}`),
        new iam.ArnPrincipal(`arn:aws:iam::${accounts.CICD_ACCOUNT_ID}:role/${frontEndCodeBuildStepRole}`),
      ),
      description: 'Role to grant access to target accounts',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
      ],
    });

    if (props!.useRdsDataBase) {
      const databaseSecret = sm.Secret.fromSecretCompleteArn(this, 'databaseSecret', cdk.Fn.importValue(config.resourceAttr.databaseSecretArn));
      const vpcId = ssm.StringParameter.valueFromLookup(this, config.resourceAttr.databaseVpcId);
      const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId });
      const securityGroupId = ssm.StringParameter.valueFromLookup(this, config.resourceAttr.migrationRunnerSecurityGroupId);
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