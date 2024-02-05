import * as cpl from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { AppStage } from '../app/app-stage';

export interface PipelineProps {
  readonly deploymentEnv: string;
  readonly deploymentAcct: string;
  readonly region: string;
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly preApprovalRequired: boolean | false;
  readonly branchName: string;
}

export class Pipeline extends Construct {
  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const config: any = this.node.tryGetContext('config') || {};
    const accounts = config.accounts || {};
    const connectionArn = config.connection_arn;
    const resourceAttr = config['resourceAttr'] || {};
    const authSecretName = resourceAttr['authSecretName'] || '';

    const input = cpl.CodePipelineSource.connection(
      `${props.githubOrg}/${props.githubRepo}`,
      props.githubBranch,
      { connectionArn },
    );

    const pipeline = new cpl.CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      selfMutation: true,
      pipelineName: `Pipeline-${props.deploymentEnv}`,
      synth: new cpl.CodeBuildStep('Synth', {
        input,
        env: {
          BRANCH_NAME: input.sourceAttribute('BranchName'),
          AUTH_SECRET_NAME: authSecretName,
        },
        commands: [
          'npm install projen',
          'cd $CODEBUILD_SRC_DIR/src/client_nextjs',
          'npm install',
          'npm run build',
          'cd $CODEBUILD_SRC_DIR/src/infra/lambda/app/auth && echo "$BRANCH_NAME-$AUTH_SECRET_NAME" > secret_name.txt && npm install --omit=dev',
          'cd $CODEBUILD_SRC_DIR && npx cdk synth -c TargetStack=Pipeline -c BranchName=$BRANCH_NAME',
        ],
      }),
    });

    const appStage = new AppStage(this, 'AppStage', { branchName: props.branchName }, {
      env: { account: accounts[props.deploymentAcct], region: props.region },
    });

    const pipelineStage = pipeline.addStage(appStage);

    if (props.preApprovalRequired) {
      pipelineStage.addPre(new cpl.ManualApprovalStep('approval'));
    }

  }
}