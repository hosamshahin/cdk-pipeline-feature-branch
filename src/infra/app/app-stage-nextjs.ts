import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NextjsLambdaCdkStack } from './app-stack-nextjs';

export class AppStageNextJs extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new NextjsLambdaCdkStack(this, 'NextjsLambdaCdkStack');

  }
}