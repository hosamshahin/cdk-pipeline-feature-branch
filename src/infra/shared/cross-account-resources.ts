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
    const authSecretName = resourceAttr['authSecretName'] || '';
    const webhookAPILambdaRole = resourceAttr['webhookAPILambdaRole'] || '';


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
    new iam.Role(this, 'adminRoleFromCicdAccount', {
      roleName: resourceAttr['adminRoleFromCicdAccount'],
      assumedBy: new iam.CompositePrincipal(
        new iam.ArnPrincipal(`arn:aws:iam::${accounts['CICD_ACCOUNT_ID']}:role/${webhookAPILambdaRole}`)
      ),
      description: 'Role to grant access to target accounts',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess')
      ],
    });
  }
}
