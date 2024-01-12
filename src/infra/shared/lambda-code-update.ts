import * as path from 'path';
import { CustomResource, Stack } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';

export interface LambdaCodeUpdateProps {
  readonly lambdaFunction: string;
  readonly configuration: string;
  readonly secretArn: string;
  readonly version: string;
}

export class LambdaCodeUpdate extends Construct {

  constructor(scope: Construct, id: string, props: LambdaCodeUpdateProps) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: LambdaCodeUpdateProvider.getOrCreate(this),
      resourceType: 'Custom::lambdaCodeUpdateProvider',
      properties: {
        lambdaFunction: props.lambdaFunction,
        configuration: props.configuration,
        secretArn: props.secretArn,
        version: props.version,
      },
    });
  }
}

class LambdaCodeUpdateProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const providerId = 'lambdaCodeUpdateProvider';
    const stack = Stack.of(scope);
    const group = Node.of(stack).tryFindChild(providerId) as LambdaCodeUpdateProvider || new LambdaCodeUpdateProvider(stack, providerId);
    return group.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const policyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:GetFunction',
            'lambda:UpdateFunctionCode',
          ],
          resources: [
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-check-auth-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-parse-auth-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-refresh-auth-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-sign-out-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-http-headers-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-trailing-slash-*`,
            `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*-get-root-*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:GetResourcePolicy',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:ListSecretVersionIds',
          ],
          resources: ['*'],
        }),
      ],
    });

    const lambdaBasicExecutionRolePolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
        }),
      ],
    });

    const lambdaRole = new iam.Role(this, 'CloudfrontAuthRole', {
      roleName: 'LambdaCodeUpdateProvider',
      assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal('lambda.amazonaws.com'), new iam.ServicePrincipal('edgelambda.amazonaws.com')),
      inlinePolicies: {
        policyDocument: policyDocument,
        lambdaBasicExecutionRolePolicyDocument: lambdaBasicExecutionRolePolicyDocument,
      },
    });

    const onEvent = new lambda.Function(this, 'lambdaCodeUpdateFunction', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/app/edge-lambda/bundles/lambda-code-update')),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.onEvent',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
    });

    this.provider = new cr.Provider(this, 'lambdaCodeUpdateProvider', {
      onEventHandler: onEvent,
    });
  }
}

