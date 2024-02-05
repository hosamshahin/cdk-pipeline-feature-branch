#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NextjsAppStack } from './infra/app/app-stack';
import { Pipeline } from './infra/cicd/app-pipeline-construct';
import { DBPipeline } from './infra/cicd/database-pipeline-construct';
import { PrismaStack } from './infra/cicd/prisma-stack';
import { GithubWebhookAPIStack } from './infra/shared/github-webhook-api-stack';
import { CrossAccountResources } from './infra/shared/cross-account-resources';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const config = app.node.tryGetContext('config') || {};
const resourceAttr = config['resourceAttr'] || {}
const dbPipelineBranch = resourceAttr['dbPipelineBranch'];

const targetStack = app.node.tryGetContext('TargetStack');

if (targetStack == 'Pipeline') {
  const branchName = app.node.tryGetContext('BranchName');
  const pipeline = new cdk.Stack(app, 'Pipeline', { env });
  new Pipeline(pipeline, 'Prd', {
    deploymentEnv: 'prd',
    deploymentAcct: 'PRD_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: config.githubBranch,
    preApprovalRequired: true,
    branchName
  });

  new Pipeline(pipeline, 'cicd', {
    deploymentEnv: 'cicd',
    deploymentAcct: 'DEV_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: 'not_exist_branch_to_avoid_running',
    preApprovalRequired: false,
    branchName
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

if (targetStack == 'GithubWebhookAPIStack') {
  new GithubWebhookAPIStack(app, 'GithubWebhookAPIStack', { env });
}

if (targetStack == 'PrismaStack') {
  new PrismaStack(app, 'PrismaStack', { env });
}

if (targetStack == 'NextjsAppStack') {
  new NextjsAppStack(app, 'NextjsAppStack', { branchName: 'main' }, { env });
}

if (targetStack == 'CrossAccountResources') {
  new CrossAccountResources(app, 'CrossAccountResources', { env });
}

app.synth();