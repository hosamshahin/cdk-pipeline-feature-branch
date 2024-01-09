import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';
import { PrismaStage } from './prisma-stage';

export interface PipelineProps {
  readonly deploymentEnv: string;
  readonly deploymentAcct: string;
  readonly region: string;
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly preApprovalRequired: boolean | false;
}

export class DBPipeline extends Construct {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']
    const connectionArn = config['connection_arn']

    const input = CodePipelineSource.connection(
      `${props.githubOrg}/${props.githubRepo}`,
      props.githubBranch,
      { connectionArn }
    )

    const defultSynth: ShellStep = new ShellStep('Synth', {
      input,
      commands: [
        "npm install projen",
        "npx cdk synth -c TargetStack=DBPipeline",
      ],
    })

    const dbPipeline = new CodePipeline(this, 'DBPipeline', {
      crossAccountKeys: true,
      selfMutation: false,
      pipelineName: `DBPipeline-${props.deploymentEnv}`,
      synth: defultSynth
    });

    const prismaStage = new PrismaStage(this, 'PrismaStage', {
      env: { account: accounts[props.deploymentAcct], region: props.region }
    })

    const pipelineStage = dbPipeline.addStage(prismaStage);

    if (props.preApprovalRequired) {
      pipelineStage.addPre(new ManualApprovalStep('approval'));
    }
  }
}