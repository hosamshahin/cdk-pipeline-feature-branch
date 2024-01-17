import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PrismaStack } from './prisma-stack';

export class PrismaStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    new PrismaStack(this, 'PrismaStack', props);
  }
}