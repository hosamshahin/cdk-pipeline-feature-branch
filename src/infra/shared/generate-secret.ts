import * as path from 'path';
import { CustomResource, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct, Node } from 'constructs';
import { generateFileHash } from '../lambda/utils/utils';

export class GenerateSecret extends Construct {

  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CustomResource(this, 'Resource', {
      serviceToken: GenerateSecretProvider.getOrCreate(this),
      resourceType: 'Custom::generateSecretProvider',
    });
  }
}

class GenerateSecretProvider extends Construct {
  /**
   * Returns the singleton provider.
   */
  public static getOrCreate(scope: Construct) {
    const providerId = 'generateSecretProvider';
    const stack = Stack.of(scope);
    const group = Node.of(stack).tryFindChild(providerId) as GenerateSecretProvider || new GenerateSecretProvider(stack, providerId);
    return group.provider.serviceToken;
  }

  private readonly provider: cr.Provider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const onEvent = new lambda.Function(this, 'generateSecretFunction', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/app/edge-lambda/bundles/generate-secret'), {
        assetHash: generateFileHash(path.join(__dirname, '../lambda/app/edge-lambda/generate-secret/index.ts')),
      }),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'bundle.onEvent',
    });

    this.provider = new cr.Provider(this, 'generateSecretProvider', {
      onEventHandler: onEvent,
    });
  }
}
