// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { writeFileSync, mkdtempSync } from 'fs';
import { resolve } from 'path';
import { LambdaClient, GetFunctionCommand, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import Zip from 'adm-zip';
import {
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import * as common from '../shared/shared';

const lambda = new LambdaClient({ region: 'us-east-1' });
const sm = new SecretsManagerClient({ region: 'us-east-1' });

export async function onEvent(event: any) {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      return handler(event);

    case 'Delete':
      return { physicalResourceId: '', Data: {} };
  }
}

export async function handler(event: any): Promise<any> {
  const { ResourceProperties } = event;

  const { PhysicalResourceId } = event as
    | CloudFormationCustomResourceDeleteEvent
    | CloudFormationCustomResourceUpdateEvent;

  const { lambdaFunction, configuration, secretArn } = ResourceProperties;

  let physicalResourceId: string | undefined;
  let data: { [key: string]: any } | undefined;

  ({ physicalResourceId, Data: data } = await updateLambdaCode(
    lambdaFunction,
    configuration,
    secretArn,
  ));

  return {
    PhysicalResourceId: PhysicalResourceId || physicalResourceId,
    Data: data,
  };
};

async function updateLambdaCode(
  lambdaFunction: string,
  stringifiedConfig: string,
  secretArn: string,
) {
  console.log(`Adding configuration to Lambda function ${lambdaFunction}:\n${stringifiedConfig}`);

  // get client_id and secret
  const respSm = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  console.log(JSON.parse(respSm.SecretString || ''));
  let secret = JSON.parse(respSm.SecretString || '');

  // Parse the JSON to ensure it's validity (and avoid ugly errors at runtime)
  let config = JSON.parse(stringifiedConfig);
  config.clientId = secret.clientId;
  config.clientSecret = secret.clientSecret;

  // Fetch and extract Lambda zip contents to temporary folder, add configuration.json, and rezip
  const respLambda = await lambda.send(new GetFunctionCommand({ FunctionName: lambdaFunction }));
  const data = await common.fetchUrl(respLambda.Code!.Location!);
  const lambdaZip = new Zip(data);
  console.log(
    'Lambda zip contents:',
    lambdaZip.getEntries().map((entry:any) => entry.name),
  );
  console.log('Adding (fresh) configuration.json ...');
  const tempDir = mkdtempSync('/tmp/lambda-package');
  lambdaZip.extractAllTo(tempDir, true);
  writeFileSync(
    resolve(tempDir, 'configuration.json'),
    Buffer.from(JSON.stringify(config, null, 2)),
  );
  const newLambdaZip = new Zip();
  newLambdaZip.addLocalFolder(tempDir);
  console.log(
    'New Lambda zip contents:',
    newLambdaZip.getEntries().map((entry:any) => entry.name),
  );

  const { CodeSha256, Version, FunctionArn } = await lambda.send(new UpdateFunctionCodeCommand({
    FunctionName: lambdaFunction,
    ZipFile: newLambdaZip.toBuffer(),
    Publish: true,
  }));
  console.log({ CodeSha256, Version, FunctionArn });
  return {
    physicalResourceId: lambdaFunction,
    Data: { CodeSha256, Version, FunctionArn },
  };
}
