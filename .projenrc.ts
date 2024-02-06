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
  deps: [
    'ts-deepmerge@^6.0.2',
    'deep-diff@^1.0.2',
    'npmlog@^4.1.2',
  ],
  devDeps: [
    '@types/npmlog@^4.1.4',
    '@types/deep-diff@^1.0.2',
    'cdk-nag@2.23.2',
    'yaml',
  ],
  context: {
    config: {
      githubOrg: 'hosamshahin',
      githubRepo: 'cdk-pipeline-feature-branch',
      githubBranch: 'main',
      region: 'us-east-1',
      connection_arn: 'arn:aws:codestar-connections:us-east-1:690901106489:connection/a5f54475-d8e1-4f05-a10e-34349660edce',
      accounts: {
        CICD_ACCOUNT_ID: '690901106489',
        DEV_ACCOUNT_ID: '864571753663',
        STG_ACCOUNT_ID: '787236266800',
        PRD_ACCOUNT_ID: '938711853848',
      },
      resourceAttr: {
        defaultDBName: 'postgres',
        crossAccountLambdaRole: 'crossAccountLambdaRole',
        schemaMigrationFnName: 'RDSSchemaMigrationFunction',
        migrationRunnerSecurityGroupId: '/database/SecurityGroupId',
        migrationRunnerName: 'migrationRunner',
        databaseSecretArn: 'databaseSecretArn',
        databaseVpcId: '/database/VpcId',
        adminRoleFromCicdAccount: 'adminRoleFromCicdAccount',
        webhookAPILambdaRole: 'webhookAPILambdaRole',
        dbPipelineBranch: 'dbPipelineBranch',
        authSecretName: 'cloudFrontAuthSecret',
      },
    },
  },
  jestOptions: {
    updateSnapshot: javascript.UpdateSnapshot.NEVER,
  },
  eslintOptions: {
    ignorePatterns: [
      '*.js',
      '*.d.ts',
      '*.generated.ts',
    ],
    dirs: [
      'coverage',
      'node_modules',
    ],
  },
});
project.synth();
