#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
// import { NextjsAppStack } from './infra/app/app-stack';
import { Pipeline } from './infra/cicd/app-pipeline-construct';
import { DBPipeline } from './infra/cicd/database-pipeline-construct';
import { PrismaStack } from './infra/cicd/prisma-stack';
import { GithubWebhookAPI } from './infra/shared/github-webhook-api-construct';
import { CrossAccountResources } from './infra/shared/cross-account-resources';
import { AppStage } from './infra/app/app-stack';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const config = app.node.tryGetContext('config') || {};
const resourceAttr = config['resourceAttr'] || {}
const dbPipelineBranch = resourceAttr['dbPipelineBranch'];
const branchName = app.node.tryGetContext('BranchName');
const targetStack = app.node.tryGetContext('TargetStack');

if (targetStack == 'Pipeline') {
  const stack = new cdk.Stack(app, `pipeline-${branchName}`, { env });
  const appStage = new AppStage(stack, `stage-${branchName}`, { env });

  new Pipeline(stack, branchName, {
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    commandsPath: '$CODEBUILD_SRC_DIR/src/infra/scripts/buildspec.sh',
    appStage
  });
}

if (targetStack == 'DBPipeline') {
  const dbPipeline = new cdk.Stack(app, 'DBPipeline', { env });
  new DBPipeline(dbPipeline, 'dev', {
    deploymentEnv: 'dev',
    deploymentAcct: 'DEV_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: dbPipelineBranch,
    preApprovalRequired: true,
  });

  new DBPipeline(dbPipeline, 'prd', {
    deploymentEnv: 'prd',
    deploymentAcct: 'PRD_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: dbPipelineBranch,
    preApprovalRequired: true,
  });
}

if (targetStack == 'GithubWebhookAPI') {
  const stack = new cdk.Stack(app, 'GithubWebhookAPI', { env });
  new GithubWebhookAPI(stack, 'GithubWebhookAPI', {
    buildSpecPath: 'src/infra/scripts/buildspec.yaml',
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo
  });
}

if (targetStack == 'PrismaStack') {
  new PrismaStack(app, 'PrismaStack', { env });
}

// if (targetStack == 'NextjsAppStack') {
//   new NextjsAppStack(app, 'NextjsAppStack', { branchName: 'main' }, { env });
// }

if (targetStack == 'CrossAccountResources') {
  new CrossAccountResources(app, 'CrossAccountResources', { env });
}

app.synth();