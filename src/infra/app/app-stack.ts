import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambdaNodeJs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { Trigger } from "aws-cdk-lib/triggers";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct'

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

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']

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

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(this.bucket, {
          originPath: "/frontend",
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/uploads/*": {
          origin: new cloudfrontOrigins.S3Origin(this.bucket, {
            originPath: "/",
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
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

    const databaseSecret = sm.Secret.fromSecretCompleteArn(this, 'databaseSecret', cdk.Fn.importValue(config['resourceAttr']['databaseSecretArn']));
    const vpcId = ssm.StringParameter.valueFromLookup(this, config['resourceAttr']['databaseVpcId']);
    const vpc = ec2.Vpc.fromLookup(this, "VPC", { vpcId });
    const securityGroup = ec2.SecurityGroup.fromLookupById(this, 'securityGroupId', cdk.Fn.importValue(config['resourceAttr']['migrationRunnerSecurityGroupId']))

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
