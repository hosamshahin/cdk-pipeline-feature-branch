import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
// import { Trigger } from "aws-cdk-lib/triggers";

export class PrismaStack extends cdk.Stack {
  readonly database: rds.DatabaseInstance;
  readonly migrationRunner: DockerPrismaFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, `Vpc`);

    const securityGroup = new ec2.SecurityGroup(this, `SecurityGroup`, { vpc });

    this.database = new rds.DatabaseInstance(this, "PostgresInstance", {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnets: vpc.isolatedSubnets.concat(vpc.privateSubnets) })
    });

    this.database.connections.allowDefaultPortFrom(securityGroup);

    const conn: DatabaseConnectionProps = {
      host: this.database.instanceEndpoint.hostname,
      port: cdk.Token.asString(this.database.instanceEndpoint.port),
      engine: this.database.secret!.secretValueFromJson("engine").toString(),
      username: this.database.secret!.secretValueFromJson("username").toString(),
      password: this.database.secret!.secretValueFromJson("password").toString(),
    }

    // Zip bundle
    new PrismaFunction(this, "Handler", {
      entry: require.resolve('../lambda/prisma/handler.ts'),
      memorySize: 256,
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      vpc,
      securityGroups: [securityGroup],
      conn,
      depsLockFilePath: require.resolve('../lambda/prisma/package-lock.json'),
    });

    new PrismaFunction(this, "MigrationRunner", {
      entry: require.resolve('../lambda/prisma/migration-runner.ts'),
      memorySize: 256,
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      vpc,
      securityGroups: [securityGroup],
      conn,
      depsLockFilePath: require.resolve('../lambda/prisma/package-lock.json'),
    });

    // Docker bundle
    const handler = new DockerPrismaFunction(this, "DockerHandler", {
      code: lambda.DockerImageCode.fromImageAsset(
        './src/infra/lambda/prisma', {
        platform: Platform.LINUX_AMD64
      }),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      vpc,
      securityGroups: [securityGroup],
      conn,
    });

    this.migrationRunner = new DockerPrismaFunction(this, "DockerMigrationRunner", {
      code: lambda.DockerImageCode.fromImageAsset(
        './src/infra/lambda/prisma', {
        cmd: ["migration-runner.handler"],
        platform: Platform.LINUX_AMD64,
      }),
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      vpc,
      securityGroups: [securityGroup],
      conn,
    });

    new cdk.CfnOutput(this, `HandlerLambdaArn`, { value: handler.functionArn });
    new cdk.CfnOutput(this, `MigrationRunnerLambdaArn`, { value: this.migrationRunner.functionArn });

    // run database migration during CDK deployment
    // const trigger = new Trigger(this, "MigrationTrigger", {
    //   handler: db.migrationRunner,
    // });

    // make sure migration is executed after the database cluster is available.
    // trigger.node.addDependency(db.database);
  }
}

export interface DatabaseConnectionProps {
  host: string;
  port: string;
  engine: string;
  username: string;
  password: string;
}

interface DockerPrismaFunctionProps extends lambda.DockerImageFunctionProps {
  conn: DatabaseConnectionProps;
}

export class DockerPrismaFunction extends lambda.DockerImageFunction {
  constructor(scope: Construct, id: string, props: DockerPrismaFunctionProps) {
    super(scope, id, {
      ...props,
      environment: {
        ...props.environment,
        DATABASE_HOST: props.conn.host,
        DATABASE_PORT: props.conn.port,
        DATABASE_ENGINE: props.conn.engine,
        DATABASE_USER: props.conn.username,
        DATABASE_PASSWORD: props.conn.password,
      },
    });
  }
}

interface PrismaFunctionProps extends lambdanode.NodejsFunctionProps {
  conn: DatabaseConnectionProps;
}

export class PrismaFunction extends lambdanode.NodejsFunction {
  constructor(scope: Construct, id: string, props: PrismaFunctionProps) {
    super(scope, id, {
      ...props,
      environment: {
        ...props.environment,
        DATABASE_HOST: props.conn.host,
        DATABASE_PORT: props.conn.port,
        DATABASE_ENGINE: props.conn.engine,
        DATABASE_USER: props.conn.username,
        DATABASE_PASSWORD: props.conn.password,
      },
      bundling: {
        nodeModules: ["prisma", "@prisma/client"].concat(props.bundling?.nodeModules ?? []),
        commandHooks: {
          beforeInstall: (i, o) => [
            // Copy prisma directory to Lambda code asset
            // the directory must be placed on the same directory as your Lambda code
            `cp -r ${i}/prisma ${o}`,
          ],
          beforeBundling: () => [],
          afterBundling: () => [],
        },
      },
    });
  }
}