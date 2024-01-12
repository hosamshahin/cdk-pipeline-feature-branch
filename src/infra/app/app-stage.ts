import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { AppStack } from './app-stack';

export class AppStage extends cdk.Stage {
  public readonly cfnOutApiImagesUrl: cdk.CfnOutput;
  public readonly cfnOutCloudFrontUrl: cdk.CfnOutput;
  public readonly cfnOutBucketName: cdk.CfnOutput;
  public readonly cfnOutBucketArn: cdk.CfnOutput;
  public readonly cfnOutDistributionId: cdk.CfnOutput;
  public readonly cfnOutApiLikesUrl: cdk.CfnOutput;


  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const appStack = new AppStack(this, 'AppStack', 'CloudfrontAuth', props);

    this.cfnOutApiImagesUrl = appStack.cfnOutApiImagesUrl;
    this.cfnOutCloudFrontUrl = appStack.cfnOutCloudFrontUrl;
    this.cfnOutBucketName = appStack.cfnOutBucketName;
    this.cfnOutBucketArn = appStack.cfnOutBucketArn;
    this.cfnOutDistributionId = appStack.cfnOutDistributionId;
    this.cfnOutApiLikesUrl = appStack.cfnOutApiLikesUrl;
  }
}