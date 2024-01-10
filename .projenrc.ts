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
      "githubOrg": "hosamshahin",
      "githubRepo": "cdk-pipeline-feature-branch",
      "githubBranch": "main",
      "region": "us-east-1",
      "connection_arn": "arn:aws:codestar-connections:us-east-1:690901106489:connection/947df6a7-dcd6-4c05-a53c-1173466436d3",
      "accounts": {
        "CICD_ACCOUNT_ID": "690901106489",
        "DEV_ACCOUNT_ID": "864571753663",
        "STG_ACCOUNT_ID": "787236266800",
        "PRD_ACCOUNT_ID": "938711853848"
      },
      "resourceAttr":{
        "defaultDBName": "postgres",
        "crossAccountLambdaRole": "crossAccountLambdaRole",
        "schemaMigrationFnName": "RDSSchemaMigrationFunction",
        "migrationRunnerSecurityGroupId": "/database/SecurityGroupId",
        "migrationRunnerName": "migrationRunner",
        "databaseSecretArn": "databaseSecretArn",
        "databaseVpcId": "/database/VpcId"
      }
    }
  }

});
project.synth();
