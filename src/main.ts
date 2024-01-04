#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Pipeline } from './infra/cicd/pipeline-construct';
import { BootstrapAdminRole } from './infra/shared/bootstrap-cross-account-admin-role';
import { GithubWebhookAPIStack } from './infra/shared/github-webhook-api-stack';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
}

const config = app.node.tryGetContext("config")

const targetStack = app.node.tryGetContext('TargetStack');

const pipeline = new cdk.Stack(app, 'Pipeline', {env});

if (targetStack == 'Pipeline') {
  new Pipeline(pipeline, 'Prd', {
    deploymentEnv: 'prd',
    deploymentAcct: 'PRD_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: config.githubBranch,
    preApprovalRequired: true,
    pipelineGenerator: false
  });

  new Pipeline(pipeline, 'PGen', {
    deploymentEnv: 'PGen',
    deploymentAcct: 'DEV_ACCOUNT_ID',
    region: config.region,
    githubOrg: config.githubOrg,
    githubRepo: config.githubRepo,
    githubBranch: config.githubBranch,
    preApprovalRequired: false,
    pipelineGenerator: true,
  });
}

if (targetStack == 'BootstrapAdminRole') {
  new BootstrapAdminRole(app, 'BootstrapAdminRole', {env})
}

if (targetStack == 'GithubWebhookAPIStack') {
  new GithubWebhookAPIStack(app, 'GithubWebhookAPIStack', {env});
}

app.synth();