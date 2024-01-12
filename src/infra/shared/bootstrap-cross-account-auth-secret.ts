import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';

export class AuthSecret extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext("config")
    const authSecretName = config['resourceAttr']['authSecretName']

    const authSecret = new sm.Secret(this, 'AuthSecret', {
      secretName: authSecretName,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientId: '' }),
        generateStringKey: 'clientSecret',
        excludePunctuation: true,
        includeSpace: false,
      }
    });

    new cdk.CfnOutput(this, 'AuthSecretOutput', {
      exportName: 'AuthSecretOutput',
      value: authSecret.secretArn,
    });
  }
}
