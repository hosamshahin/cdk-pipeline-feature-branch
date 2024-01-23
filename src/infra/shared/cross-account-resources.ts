import * as cdk from 'aws-cdk-lib';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class CrossAccountResources extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext('config') || {};
    const accounts = config.accounts || {};
    const resourceAttr = config['resourceAttr'] || {};
    const currentAcct = cdk.Stack.of(this).account;
    const authSecretName = resourceAttr['authSecretName'] || '';
    const webhookAPILambdaRole = resourceAttr['webhookAPILambdaRole'] || '';
    let frontEndCodeBuildStepRole = resourceAttr['frontEndCodeBuildStepRole'];
    frontEndCodeBuildStepRole = currentAcct == accounts.DEV_ACCOUNT_ID ? frontEndCodeBuildStepRole : `${frontEndCodeBuildStepRole}-main`;


    const authSecret = new sm.Secret(this, 'AuthSecret', {
      secretName: authSecretName,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ config: '' }),
        generateStringKey: 'base64EcodedConfig',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    new cdk.CfnOutput(this, 'CloudfrontAuthSecretArn', {
      exportName: 'CloudfrontAuthSecretArn',
      value: authSecret.secretArn,
    });

    // CICD pipeline will assume this role to perform the follwoing actions
    // 1- Delete app stack when feature branch is deleted
    // 2- Push the client artifacts to dev/prod s3 bucket
    // 3- invalidate CloudFront cache in dev/prod accounts
    new iam.Role(this, 'adminRoleFromCicdAccount', {
      roleName: resourceAttr['adminRoleFromCicdAccount'],
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(`arn:aws:iam::${accounts['CICD_ACCOUNT_ID']}:role/${webhookAPILambdaRole}`),
        new iam.ArnPrincipal(`arn:aws:iam::${accounts['CICD_ACCOUNT_ID']}:role/${frontEndCodeBuildStepRole}`),
      ),
      description: 'Role to grant access to target accounts',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
      ],
    });
  }
}
