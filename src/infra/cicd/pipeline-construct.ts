import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { AppStage } from '../app/app-stage';

export interface PipelineProps {
  readonly deploymentEnv: string;
  readonly deploymentAcct: string;
  readonly region: string;
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly preApprovalRequired: boolean | false;
}

export class Pipeline extends Construct {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']
    const connectionArn = config['connection_arn']
    const input: cdk.pipelines.IFileSetProducer = CodePipelineSource.connection(
      `${props.githubOrg}/${props.githubRepo}`,
      props.githubBranch,
      { connectionArn }
    )

    const defultSynth: ShellStep = new ShellStep('Synth', {
      input,
      commands: [
        "npm install projen",
        "npx cdk synth -c TargetStack=Pipeline"
      ],
    })

    const pipeline = new CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      selfMutation: false,
      pipelineName: `Pipeline-${props.deploymentEnv}`,
      synth: defultSynth
    });

    const stage = new AppStage(this, 'AppStage', {
      env: { account: accounts[props.deploymentAcct], region: props.region }
    })

    const pipelineStage = pipeline.addStage(stage);
    if (props.preApprovalRequired) {
      pipelineStage.addPre(new ManualApprovalStep('approval'));
    }
  }
}