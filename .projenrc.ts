import { awscdk, javascript } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  name: 'cdk-pipeline-feature-branch',
  cdkVersion: '2.117.0',
  cdkVersionPinning: true,
  defaultReleaseBranch: 'main',
  projenrcTs: true,
  requireApproval: awscdk.ApprovalLevel.NEVER,
  packageManager: javascript.NodePackageManager.NPM,
  constructsVersion: '10.2.55',
  buildWorkflow: false,
  release: false,
  sampleCode: false,
  context: {
    "config": {
      "githubOrg": "NinjaNotTurtles",
      "githubRepo": "cdk-pipeline-feature-branch",
      "githubBranch": "main",
      "region": "us-east-1",
      "connection_arn": "arn:aws:codestar-connections:us-east-1:645278470600:connection/90423367-38b7-4243-a0e7-db804bbc96fb",
      "accounts": {
        "CICD_ACCOUNT_ID": "645278470600",
        "DEV_ACCOUNT_ID": "447515469915",
        "PRD_ACCOUNT_ID": "742169474962"
      }
    }
  }

});
project.synth();
