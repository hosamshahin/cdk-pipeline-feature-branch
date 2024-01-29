import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppStack } from './app-stack';
import { NextjsLambdaCdkStack } from './app-stack-nextjs';

export interface AppStageProps {
  branchName: string;
}

export class AppStage extends cdk.Stage {
  public readonly cfnOutApiImagesUrl: cdk.CfnOutput;
  public readonly cfnOutCloudFrontUrl: cdk.CfnOutput;
  public readonly cfnOutBucketName: cdk.CfnOutput;
  public readonly cfnOutBucketArn: cdk.CfnOutput;
  public readonly cfnOutDistributionId: cdk.CfnOutput;
  public readonly cfnOutApiLikesUrl: cdk.CfnOutput;


  constructor(scope: Construct, id: string, props: AppStageProps, stageProps?: cdk.StageProps) {
    super(scope, id, stageProps);

    const appStack = new AppStack(this, 'AppStack', { branchName: props.branchName }, stageProps);
    new NextjsLambdaCdkStack(this, 'NextjsLambdaCdkStack');

    this.cfnOutApiImagesUrl = appStack.cfnOutApiImagesUrl;
    this.cfnOutCloudFrontUrl = appStack.cfnOutCloudFrontUrl;
    this.cfnOutBucketName = appStack.cfnOutBucketName;
    this.cfnOutBucketArn = appStack.cfnOutBucketArn;
    this.cfnOutDistributionId = appStack.cfnOutDistributionId;
    this.cfnOutApiLikesUrl = appStack.cfnOutApiLikesUrl;
  }
}
