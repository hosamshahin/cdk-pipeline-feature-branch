import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NextjsAppStack } from './app-stack';

export interface AppStageProps {
  branchName: string;
}

export class AppStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props: AppStageProps, stageProps?: cdk.StageProps) {
    super(scope, id, stageProps);

    new NextjsAppStack(this, 'AppStack', { branchName: props.branchName }, stageProps);

  }
}
