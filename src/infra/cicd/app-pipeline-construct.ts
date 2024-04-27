import * as cpl from 'aws-cdk-lib/pipelines';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PipelineProps {
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly preApprovalRequired?: boolean | false;
  readonly appStage: cdk.Stage;
  readonly commandsPath: string;
}

export class Pipeline extends Construct {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const config: any = this.node.tryGetContext('config') || {};
    const connectionArn = config.connection_arn;

    const input = cpl.CodePipelineSource.connection(
      `${props.githubOrg}/${props.githubRepo}`, id,
      {
        connectionArn,
        actionName: 'source'
      },
    );

    const pipeline = new cpl.CodePipeline(this, 'Pipeline', {
      crossAccountKeys: false,
      selfMutation: true,
      pipelineName: id,
      synth: new cpl.ShellStep('Synth', {
        input,
        env: {
          BRANCH_NAME: input.sourceAttribute('BranchName')
        },
        commands: [props.commandsPath]
      }),
      useChangeSets: false,
    });

    const pipelineStage = pipeline.addStage(props.appStage);

    if (props.preApprovalRequired) {
      pipelineStage.addPre(new cpl.ManualApprovalStep('approval'));
    }

  }
}