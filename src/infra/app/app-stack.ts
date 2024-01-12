import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambdaNodeJs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Trigger } from "aws-cdk-lib/triggers";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { GenerateSecret } from '../shared/generate-secret'
import { LambdaCodeUpdate } from '../shared/lambda-code-update';
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct'

export enum LogLevel {
  NONE = 'none',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
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
    edgeLambdaNameParam?: string,
    props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']
    const currentAcct = cdk.Stack.of(this).account
    const webhookAPILambdaRole = config['resourceAttr']['webhookAPILambdaRole']
    let frontEndCodeBuildStepRole = config['resourceAttr']['frontEndCodeBuildStepRole']
    frontEndCodeBuildStepRole = currentAcct == accounts['DEV_ACCOUNT_ID'] ? frontEndCodeBuildStepRole : `${frontEndCodeBuildStepRole}-main`

    // Remediating AwsSolutions-S10 by enforcing SSL on the bucket.
    this.bucket = new s3.Bucket(this, "Bucket", {
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins: ["*"],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
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
            'aws:PrincipalAccount': accounts['CICD_ACCOUNT_ID'],
          },
        },
        effect: iam.Effect.ALLOW,
        resources: [`${this.bucket.bucketArn}/*`],
      })
    )

    /**
     * CloudFront Distribution and lambda edge
     */
    const authSecret = new sm.Secret(this, 'AuthSecret', {
      secretName: id + '-rds-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientId: '', clientSecret: '' })
      }
    });

    const generateSecret = (new GenerateSecret(this, 'GenerateSecret').node.defaultChild as cdk.CustomResource).getAtt('secret').toString();

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
      },
    });

    let edgeLambdaName = edgeLambdaNameParam || 'CloudfrontAuth';

    const cloudfrontCheckAuthFunction = new lambda.Function(this, 'CloudfrontCheckAuthFunction', {
      functionName: `${edgeLambdaName}-check-auth`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/check-auth'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const cloudfrontParseAuthFunction = new lambda.Function(this, 'CloudfrontParseAuthFunction', {
      functionName: `${edgeLambdaName}-parse-auth`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/parse-auth'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const cloudfrontRefreshAuthFunction = new lambda.Function(this, 'CloudfrontRefreshAuthFunction', {
      functionName: `${edgeLambdaName}-refresh-auth`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/refresh-auth'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const cloudfrontSignOutFunction = new lambda.Function(this, 'CloudfrontSignOutFunction', {
      functionName: `${edgeLambdaName}-sign-out`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/sign-out'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const cloudfrontHttpHeadersFunction = new lambda.Function(this, 'CloudfrontHttpHeadersFunction', {
      functionName: `${edgeLambdaName}-http-headers`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/http-headers'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const cloudfrontRewriteTrailingSlashFunction = new lambda.Function(this, 'CloudfrontRewriteTrailingSlashFunction', {
      functionName: `${edgeLambdaName}-trailing-slash`,
      code: lambda.Code.fromAsset('src/infra/lambda/app/edge-lambda/bundles/rewrite-trailing-slash'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.handler',
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5),
    });

    const lambdaEdgeConfig: any = {
      oauthScopes: [
        cognito.OAuthScope.EMAIL.scopeName,
        cognito.OAuthScope.OPENID.scopeName,
        'groups',
      ],
      authEndpoint: 'https://sso.google.com/as/authorization.oauth2',
      accessTokenEndpoint: 'https://sso.google.com/as/token.oauth2',
      introspectEndpoint: 'https://sso.google.com/as/introspect.oauth2',
      pingEndSessionEndpoint: 'https://sso.google.com/idp/startSLO.ping',
      redirectPathSignIn: '/parseauth',
      redirectPathSignOut: '/',
      signOutUrl: '/signout',
      redirectPathAuthRefresh: '/refreshauth',
      cookieSettings: {},
      httpHeaders: {
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; script-src 'self' https://code.jquery.com https://stackpath.bootstrapcdn.com; style-src 'self' 'unsafe-inline' https://stackpath.bootstrapcdn.com; object-src 'none'; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com",
        'Strict-Transport-Security': 'max-age=31536000; includeSubdomains; preload',
        'Referrer-Policy': 'same-origin',
        'X-XSS-Protection': '1; mode=block',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      },
      logLevel: LogLevel.DEBUG,
      nonceSigningSecret: generateSecret.toString(),
      idTokenCookieName: 'px-access-token',
      staticContentPathPattern: 'staticContentPathPattern',
      staticContentRootObject: 'staticContentRootObject'
    };

    const cloudfrontCheckAuthFnArn = (new LambdaCodeUpdate(this, 'CloudfrontCheckAuthFn', {
      lambdaFunction: cloudfrontCheckAuthFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    const cloudfrontParseAuthFnArn = (new LambdaCodeUpdate(this, 'CloudfrontParseAuthFn', {
      lambdaFunction: cloudfrontParseAuthFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    const cloudfrontRefreshAuthFnArn = (new LambdaCodeUpdate(this, 'CloudfrontRefreshAuthFn', {
      lambdaFunction: cloudfrontRefreshAuthFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    const cloudfrontSignOutFnArn = (new LambdaCodeUpdate(this, 'CloudfrontSignOutFn', {
      lambdaFunction: cloudfrontSignOutFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    const cloudfrontRewriteTrailingSlashFnArn = (new LambdaCodeUpdate(this, 'CloudfrontRewriteTrailingSlashFn', {
      lambdaFunction: cloudfrontRewriteTrailingSlashFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    const cloudfrontHttpHeadersFnArn = (new LambdaCodeUpdate(this, 'CloudfrontHttpHeadersFn', {
      lambdaFunction: cloudfrontHttpHeadersFunction.functionName,
      configuration: JSON.stringify(lambdaEdgeConfig),
      secretArn: authSecret.secretArn,
      version: Math.floor(Date.now() / 1000).toString(),
    }).node.defaultChild as cdk.CustomResource).getAtt('FunctionArn').toString();

    var edgeLambdas: cloudfront.EdgeLambda[] = [{
      eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontCheckAuthFnVersionArn', cloudfrontCheckAuthFnArn),
      includeBody: false,
    },
    {
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
      functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontHttpHeadersFnVersionArn', cloudfrontHttpHeadersFnArn),
      includeBody: false,
    },
    {
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
      functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontRewriteTrailingSlashFnVersionArn', cloudfrontRewriteTrailingSlashFnArn),
      includeBody: false,
    }];

    const additionalBehaviors: any = {
      'parseauth': {
        origin: new origins.HttpOrigin('will-never-be-reached.org'),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: false,
        edgeLambdas: [{
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontParseAuthFnVersionArn', cloudfrontParseAuthFnArn),
          includeBody: false,
        }],
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      'refreshauth': {
        origin: new origins.HttpOrigin('will-never-be-reached.org'),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: false,
        edgeLambdas: [{
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontRefreshAuthFnVersionArn', cloudfrontRefreshAuthFnArn),
          includeBody: false,
        }],
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      '/signout': {
        origin: new origins.HttpOrigin('will-never-be-reached.org'),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: false,
        edgeLambdas: [{
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: lambda.Version.fromVersionArn(this, 'cloudfrontSignOutFnVersionArn', cloudfrontSignOutFnArn),
          includeBody: false,
        }],
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      "/uploads/*": {
        origin: new cloudfrontOrigins.S3Origin(this.bucket, {
          originPath: "/",
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    };


    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(this.bucket, {
          originPath: "/frontend",
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas
      },
      additionalBehaviors
    });

    this.cfnOutCloudFrontUrl = new cdk.CfnOutput(this, "CfnOutCloudFrontUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
      description: "URL for CLOUDFRONT_URL in `frontend/.env` file",
    });

    this.cfnOutDistributionId = new cdk.CfnOutput(this, "CfnOutDistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront Distribution Id",
    });

    this.cfnOutBucketName = new cdk.CfnOutput(this, "CfnOutBucketName", {
      value: this.bucket.bucketName,
      description: "Website Hosting Bucket Name",
    });

    this.cfnOutBucketArn = new cdk.CfnOutput(this, "cfnOutBucketArn", {
      value: this.bucket.bucketArn,
      description: "Website Hosting Bucket Name",
    });

    const likesTable = new dynamo.Table(this, 'LikesTable', {
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'imageKeyS3',
        type: dynamo.AttributeType.STRING,
      },
    });

    let lambdaApiHandlerPublic = new lambdaNodeJs.NodejsFunction(this, "ApiHandlerPublic", {
      entry: require.resolve("../lambda/app/coffee-listing-api-public"),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        BUCKER_UPLOAD_FOLDER_NAME: "uploads",
      },
    });

    this.bucket.grantReadWrite(lambdaApiHandlerPublic);

    let lambdaApiHandlerPrivate = new lambdaNodeJs.NodejsFunction(this, "ApiHandlerPrivate", {
      entry: require.resolve("../lambda/app/coffee-listing-api-private"),
      environment: {
        DYNAMODB_TABLE_LIKES_NAME: likesTable.tableName,
      }
    });

    lambdaApiHandlerPrivate.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query", "dynamodb:UpdateItem"],
        resources: [likesTable.tableArn],
      })
    );

    let restApi = new apigateway.LambdaRestApi(this, "RestApi", {
      handler: lambdaApiHandlerPublic,
      proxy: false,
    });

    let apiImages = restApi.root.addResource("images", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    apiImages.addMethod("GET");
    apiImages.addMethod("POST");

    let apiLikes = restApi.root.addResource("likes", {
      defaultIntegration: new apigateway.LambdaIntegration(lambdaApiHandlerPrivate),
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    apiLikes.addMethod("POST");

    let apiLikesImage = apiLikes.addResource("{imageKeyS3}");
    apiLikesImage.addMethod("GET");

    this.restApi = restApi;

    this.cfnOutApiLikesUrl = new cdk.CfnOutput(this, "CfnOutApiLikesUrl", {
      value: restApi.urlForPath("/likes"),
      description: "Likes API URL for `frontend/.env` file",
    });

    this.cfnOutApiImagesUrl = new cdk.CfnOutput(this, "CfnOutApiImagesUrl", {
      value: restApi.urlForPath("/images"),
      description: "Images API URL for `frontend/.env` file",
    });

    // CICD pipeline will assume this role to perform the follwoing actions
    // 1- Delete app stack when feature branch is deleted
    // 2- Push the client artifacts to dev/prod s3 bucket
    // 3- invalidate CloudFront cache in dev/prod accounts
    new iam.Role(this, 'adminRoleFromCicdAccount', {
      roleName: config['resourceAttr']['adminRoleFromCicdAccount'],
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(`arn:aws:iam::${accounts['CICD_ACCOUNT_ID']}:role/${webhookAPILambdaRole}`),
        new iam.ArnPrincipal(`arn:aws:iam::${accounts['CICD_ACCOUNT_ID']}:role/${frontEndCodeBuildStepRole}`)
      ),
      description: 'Role to grant access to target accounts',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
      ]
    });

    const databaseSecret = sm.Secret.fromSecretCompleteArn(this, 'databaseSecret', cdk.Fn.importValue(config['resourceAttr']['databaseSecretArn']));
    const vpcId = ssm.StringParameter.valueFromLookup(this, config['resourceAttr']['databaseVpcId']);
    const vpc = ec2.Vpc.fromLookup(this, "VPC", { vpcId });
    const securityGroupId = ssm.StringParameter.valueFromLookup(this, config['resourceAttr']['migrationRunnerSecurityGroupId']);
    const securityGroup = ec2.SecurityGroup.fromLookupById(this, 'securityGroupId', securityGroupId)

    const conn: DatabaseConnectionProps = {
      host: databaseSecret.secretValueFromJson("host").toString(),
      port: databaseSecret.secretValueFromJson("port").toString(),
      engine: databaseSecret.secretValueFromJson("engine").toString(),
      username: databaseSecret.secretValueFromJson("username").toString(),
      password: databaseSecret.secretValueFromJson("password").toString(),
    }

    const migrationRunner = new DockerPrismaFunction(this, "DockerMigrationRunner", {
      code: lambda.DockerImageCode.fromImageAsset(
        './src/infra/lambda/prisma', {
        cmd: ["migration-runner.handler"],
        platform: Platform.LINUX_AMD64,
      }),
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      vpc,
      securityGroups: [securityGroup],
      conn
    });

    // run database migration during CDK deployment
    new Trigger(this, "MigrationTrigger", {
      handler: migrationRunner,
    });

  }
}
