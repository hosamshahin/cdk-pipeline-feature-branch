import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as yaml from 'yaml';
import { NextjsAppStack } from '../src/infra/app/app-stack';

let fromAssetMock;
beforeAll((): void => {
  fromAssetMock = jest.spyOn(lambda.Code, 'fromAsset').mockReturnValue({
    isInline: false,
    bind: () => {
      return {
        s3Location: {
          bucketName: 'bucketName',
          objectKey: 'objectKey',
        },
      };
    },
    bindToResource: () => {
      return;
    },
  } as any);
});

afterAll(() => {
  fromAssetMock!.mockRestore();
});

test('AppStack cdk-nag AwsSolutions Pack', () => {

  const app = new cdk.App();
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };

  const stack = new NextjsAppStack(app, 'AppStack', { branchName: 'main' }, { env });

  cdk.Aspects.of(stack).add(new AwsSolutionsChecks());

  NagSuppressions.addStackSuppressions(stack, [
    { id: 'AwsSolutions-APIG3', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-CFR1', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-CFR2', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-SMG4', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-IAM4', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-L1', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-APIG2', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-APIG1', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-APIG6', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-APIG4', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-COG4', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-IAM5', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-S1', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-S10', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-CFR3', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-CFR4', reason: 'TBD reason of 10 characters or more' },
  ]);

  const warnings = Annotations.fromStack(stack).findWarning(
    '*',
    Match.stringLikeRegexp('AwsSolutions-.*'),
  );

  // console.dir(warnings);
  expect(warnings).toHaveLength(0);

  const errors = Annotations.fromStack(stack).findError(
    '*',
    Match.stringLikeRegexp('AwsSolutions-.*'),
  );

  // console.dir(errors);
  expect(errors).toHaveLength(0);

  const template = Template.fromStack(stack);
  expect(yaml.stringify(template)).toMatchSnapshot();

});
