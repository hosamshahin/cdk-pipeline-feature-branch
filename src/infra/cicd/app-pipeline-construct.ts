import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cpl from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { AppStage } from '../app/app-stage';
// import { AppStageNextJs } from '../app/app-stage-nextjs';

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

    const config: any = this.node.tryGetContext('config') || {};
    const accounts = config.accounts || {};
    const connectionArn = config.connection_arn;
    const resourceAttr = config.resourceAttr || {};
    const adminRoleFromCicdAccount = resourceAttr.adminRoleFromCicdAccount;
    const frontEndCodeBuildStepRole = resourceAttr.frontEndCodeBuildStepRole;

    const input = cpl.CodePipelineSource.connection(
      `${props.githubOrg}/${props.githubRepo}`,
      props.githubBranch,
      { connectionArn },
    );

    const pipeline = new cpl.CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      selfMutation: true,
      pipelineName: `Pipeline-${props.deploymentEnv}`,
      synth: new cpl.ShellStep('Synth', {
        input,
        commands: [
          'npm install projen',
          'cd $CODEBUILD_SRC_DIR/src/client_nextjs',
          'npm install',
          'npm run build',
          'cd $CODEBUILD_SRC_DIR/src/infra/lambda/app/auth && npm install --omit=dev',
          'cd $CODEBUILD_SRC_DIR && npm run test && npx cdk synth -c TargetStack=Pipeline',
        ],
      }),
    });

    const appStage = new AppStage(this, 'AppStage', {
      env: { account: accounts[props.deploymentAcct], region: props.region },
    });

    // const appStageNextJs = new AppStageNextJs(this, 'AppStageNextJs', {
    //   env: { account: accounts[props.deploymentAcct], region: props.region },
    // });

    const pipelineStage = pipeline.addStage(appStage);
    // const pipelineStageNextjs = pipeline.addStage(appStageNextJs);

    if (props.preApprovalRequired) {
      pipelineStage.addPre(new cpl.ManualApprovalStep('approval'));
      // pipelineStageNextjs.addPre(new cpl.ManualApprovalStep('approval'));
    }

    const codeBuildStep = new cpl.CodeBuildStep('DeployFrontEnd', {
      envFromCfnOutputs: {
        SNOWPACK_PUBLIC_CLOUDFRONT_URL: appStage.cfnOutCloudFrontUrl,
        SNOWPACK_PUBLIC_API_IMAGES_URL: appStage.cfnOutApiImagesUrl,
        BUCKET_NAME: appStage.cfnOutBucketName,
        DISTRIBUTION_ID: appStage.cfnOutDistributionId,
        SNOWPACK_PUBLIC_API_LIKES_URL: appStage.cfnOutApiLikesUrl,
      },
      env: {
        BRANCH_NAME: input.sourceAttribute('BranchName'),
        DEV_ACCOUNT_ID: accounts.DEV_ACCOUNT_ID,
        PRD_ACCOUNT_ID: accounts.PRD_ACCOUNT_ID,
        REGION: config.region,
        adminRoleFromCicdAccount,
      },
      commands: [
        'cd $CODEBUILD_SRC_DIR/src/client',
        'npm ci',
        'npm run build',
        'aws s3 cp $CODEBUILD_SRC_DIR/src/client/src/build s3://$BUCKET_NAME/frontend --recursive',
        "if [ \"$BRANCH_NAME\" = \"main\" ]; then\n    role_arn=\"arn:aws:iam::$PRD_ACCOUNT_ID:role/$adminRoleFromCicdAccount\"\nelse\n    role_arn=\"arn:aws:iam::$DEV_ACCOUNT_ID:role/$adminRoleFromCicdAccount\"\nfi\nsession=\"AssumedRoleSession\"\ntarget_account_region=\"$REGION\"\noutput=$(aws sts assume-role \\\n  --role-arn \"$role_arn\" \\\n  --role-session-name \"$session\" \\\n  --duration-seconds 900 \\\n  --region \"$target_account_region\")\n\naccess_key_id=$(echo \"$output\" | jq -r '.Credentials.AccessKeyId')\nsecret_access_key=$(echo \"$output\" | jq -r '.Credentials.SecretAccessKey')\nsession_token=$(echo \"$output\" | jq -r '.Credentials.SessionToken')\n\nexport AWS_ACCESS_KEY_ID=\"$access_key_id\"\nexport AWS_SECRET_ACCESS_KEY=\"$secret_access_key\"\nexport AWS_SESSION_TOKEN=\"$session_token\"\n\naws cloudfront create-invalidation \\\n  --distribution-id \"$DISTRIBUTION_ID\" \\\n  --paths \"/*\"\n",
      ],
      rolePolicyStatements: [
        new iam.PolicyStatement({
          resources: [
            'arn:aws:s3:::appstage-appstack-bucket*/*',
            'arn:aws:s3:::*appstage-appstack-bucket*/*',
          ],
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:PutObjectAcl',
          ],
        }),
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:aws:iam::${accounts.DEV_ACCOUNT_ID}:role/${adminRoleFromCicdAccount}`,
            `arn:aws:iam::${accounts.PRD_ACCOUNT_ID}:role/${adminRoleFromCicdAccount}`,
          ],
        }),
      ],
    });

    pipelineStage.addPost(codeBuildStep);
    pipeline.buildPipeline();

    let cfnRole = (codeBuildStep.project.role as iam.Role).node.defaultChild as iam.CfnRole;

    let roleName: string = '';

    if (props.githubBranch == 'main') {
      roleName = `${frontEndCodeBuildStepRole}-main`;
    } else {
      roleName = `${frontEndCodeBuildStepRole}`;
    }

    cfnRole.addPropertyOverride('RoleName', roleName);

    new cdk.CfnOutput(this, roleName, {
      value: roleName,
      description: 'Likes API URL for `frontend/.env` file',
    });

  }
}