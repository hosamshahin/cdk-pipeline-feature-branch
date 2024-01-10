import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { Trigger } from "aws-cdk-lib/triggers";
import { DockerPrismaFunction, DatabaseConnectionProps } from '../shared/docker-prisma-construct'
export class PrismaStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const currentAcct = cdk.Stack.of(this).account
    const config = this.node.tryGetContext("config")
    const accounts = config['accounts']
    const vpc = new ec2.Vpc(this, `Vpc`, {
      maxAzs: 2,
      natGateways: 0
    });

    const securityGroup = new ec2.SecurityGroup(this, `SecurityGroup`, { vpc });

    const database = new rds.DatabaseInstance(this, "PostgresInstance", {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      publiclyAccessible: currentAcct == accounts['DEV_ACCOUNT_ID'] ? true : false,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: {
        subnetType: currentAcct == accounts['DEV_ACCOUNT_ID'] ? ec2.SubnetType.PUBLIC : ec2.SubnetType.PRIVATE_ISOLATED
      }
    });

    database.connections.allowDefaultPortFrom(securityGroup);

    let rdsProxyEndpoint: string= ''
    if (currentAcct == accounts['PRD_ACCOUNT_ID']) {
      const rdsProxy = database.addProxy('rdsProxy', {
        secrets: [database.secret!],
        debugLogging: true,
        iamAuth: true,
        vpc
      });
      rdsProxyEndpoint = rdsProxy.endpoint
      rdsProxy.connections.allowFrom(securityGroup, ec2.Port.tcp(database.instanceEndpoint.port))
    }

    const conn: DatabaseConnectionProps = {
      host: accounts['PRD_ACCOUNT_ID'] ? rdsProxyEndpoint : database.instanceEndpoint.hostname,
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

    new cdk.CfnOutput(this, `DatabaSecretOutput`, {
      value: database.secret!.secretArn,
      exportName: config['resourceAttr']['databaseSecretArn']
    });

    new ssm.StringParameter(this, 'VpcIdSSM', {
      parameterName: config['resourceAttr']['databaseVpcId'],
      stringValue: vpc.vpcId
    })

    new ssm.StringParameter(this, 'SecurityGroupSSM', {
      parameterName: config['resourceAttr']['migrationRunnerSecurityGroupId'],
      stringValue: securityGroup.securityGroupId
    })

    // run database migration during CDK deployment
    const trigger = new Trigger(this, "MigrationTrigger", {
      handler: migrationRunner,
    });

    // make sure migration is executed after the database cluster is available.
    trigger.node.addDependency(database);
  }
}