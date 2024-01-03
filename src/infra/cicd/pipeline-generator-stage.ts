import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { GithubWebhookAPIStack } from './github-webhook-api-stack';
import { FeaturePipelineStack } from './feature-pipeline-stack';

export class PipelineGeneratorStage extends cdk.Stage {

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new GithubWebhookAPIStack(this, 'GithubWebhookAPIStack', props);
    new FeaturePipelineStack(this, 'FeaturePipelineStack', props);
  }
}