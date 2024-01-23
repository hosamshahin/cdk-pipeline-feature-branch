import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as yaml from 'yaml';
import { PrismaStack } from '../infra/cicd/prisma-stack';

test('PrismaStack cdk-nag AwsSolutions Pack', () => {

  const app = new cdk.App();
  const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };

  const stack = new PrismaStack(app, 'PrismaStack', { env });

  cdk.Aspects.of(stack).add(new AwsSolutionsChecks());

  NagSuppressions.addStackSuppressions(stack, [
    { id: 'AwsSolutions-VPC7', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-SMG4', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-RDS2', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-RDS3', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-RDS10', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-RDS11', reason: 'TBD reason of 10 characters or more' },
    { id: 'AwsSolutions-IAM4', reason: 'TBD reason of 10 characters or more' }
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
