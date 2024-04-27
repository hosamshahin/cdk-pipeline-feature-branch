import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class NextjsAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new s3.Bucket(this, `next-bucket`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new s3.Bucket(this, `next-bucket1`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new s3.Bucket(this, `next-bucket2`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const cloudfrontAuthRole = new iam.Role(this, 'CloudfrontAuthRole', {
      assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('lambda.amazonaws.com'), new iam.ServicePrincipal('edgelambda.amazonaws.com'))
    });

    new lambdaNodeJs.NodejsFunction(this, 'CloudfrontAuthFunction', {
      entry: require.resolve('../lambda/app/auth'),
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5)
    });

    new lambdaNodeJs.NodejsFunction(this, 'CloudfrontAuthFunction1', {
      entry: require.resolve('../lambda/app/auth'),
      role: cloudfrontAuthRole,
      timeout: cdk.Duration.seconds(5)
    });

  }
}

export class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    new NextjsAppStack(this, `app`);
  }
}

