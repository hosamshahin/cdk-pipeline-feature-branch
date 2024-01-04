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
        "npx cdk synth -c TargetStack=Pipeline",
      ],
    })

    const pipeline = new CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      selfMutation: false,
      pipelineName: `Pipeline-${props.deploymentEnv}`,
      synth: defultSynth
    });

    const appStage = new AppStage(this, 'AppStage', {
      env: { account: accounts[props.deploymentAcct], region: props.region }
    })

    const pipelineStage = pipeline.addStage(appStage);

    if (props.preApprovalRequired) {
      pipelineStage.addPre(new ManualApprovalStep('approval'));
    }

    pipeline.addStage(appStage, {
      post: [
        new ShellStep("DeployFrontEnd", {
          envFromCfnOutputs: {
            SNOWPACK_PUBLIC_CLOUDFRONT_URL: appStage.cfnOutCloudFrontUrl,
            SNOWPACK_PUBLIC_API_IMAGES_URL: appStage.cfnOutApiImagesUrl,
            BUCKET_NAME: appStage.cfnOutBucketName,
            DISTRIBUTION_ID: appStage.cfnOutDistributionId,
            SNOWPACK_PUBLIC_API_LIKES_URL: appStage.cfnOutApiLikesUrl
          },
          commands: [
            "cd $CODEBUILD_SRC_DIR/src/client",
            "npm ci",
            "npm run build",
            "aws s3 cp $CODEBUILD_SRC_DIR/src/client/src/build s3://$BUCKET_NAME/frontend --recursive",
            `aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"`,
          ],
        }),
      ],
    });
  }
}