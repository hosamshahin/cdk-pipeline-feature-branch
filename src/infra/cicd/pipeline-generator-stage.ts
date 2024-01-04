import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { FeaturePipelineStack } from './feature-pipeline-stack';

export class PipelineGeneratorStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new FeaturePipelineStack(this, 'FeaturePipelineStack', props);
  }
}