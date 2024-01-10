import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

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
