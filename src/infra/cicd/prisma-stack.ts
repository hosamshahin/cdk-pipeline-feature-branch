import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { Trigger } from "aws-cdk-lib/triggers";
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct'
export class PrismaStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const config = this.node.tryGetContext("config")
    const vpc = new ec2.Vpc(this, `Vpc`);

    const securityGroup = new ec2.SecurityGroup(this, `SecurityGroup`, { vpc });

    const database = new rds.DatabaseInstance(this, "PostgresInstance", {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnets: vpc.isolatedSubnets.concat(vpc.privateSubnets) })
    });

    database.connections.allowDefaultPortFrom(securityGroup);

    const conn: DatabaseConnectionProps = {
      host: database.instanceEndpoint.hostname,
      port: cdk.Token.asString(database.instanceEndpoint.port),
      engine: database.secret!.secretValueFromJson("engine").toString(),
      username: database.secret!.secretValueFromJson("username").toString(),
      password: database.secret!.secretValueFromJson("password").toString(),
    }

    const migrationRunner = new DockerPrismaFunction(this, "DockerMigrationRunner", {
      code: lambda.DockerImageCode.fromImageAsset(
        './src/infra/lambda/prisma', {
        cmd: ["migration-runner.handler"],
        platform: Platform.LINUX_AMD64,
      }),
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      vpc,
      securityGroups: [securityGroup],
      conn
    });

    new cdk.CfnOutput(this, `MigrationRunnerLambdaArn`, {
      value: migrationRunner.functionArn
    });

    new cdk.CfnOutput(this, `securityGroupOutput`, {
      value: securityGroup.securityGroupId,
      exportName: config['resourceAttr']['migrationRunnerSecurityGroupId']
    });

    new cdk.CfnOutput(this, `databaSecretOutput`, {
      value: database.secret!.secretArn,
      exportName: config['resourceAttr']['databaseSecretArn']
    });

    new cdk.CfnOutput(this, `databaSecretOutput`, {
      value: vpc.vpcId,
      exportName: config['resourceAttr']['databaseVpcId']
    });

    // run database migration during CDK deployment
    const trigger = new Trigger(this, "MigrationTrigger", {
      handler: migrationRunner,
    });

    // make sure migration is executed after the database cluster is available.
    trigger.node.addDependency(database);
  }
}