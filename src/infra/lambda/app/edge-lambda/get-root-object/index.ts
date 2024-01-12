import { CloudFrontRequestHandler } from 'aws-lambda';
import { readFileSync } from 'fs';

export const handler: CloudFrontRequestHandler = async (event) => {
  console.log('Event:', JSON.stringify(event))

  const config = JSON.parse(readFileSync(`${__dirname}/configuration.json`).toString('utf8'))

  const request = event.Records[0].cf.request;

  if (!request.uri.includes('.')) {
    request.uri = config.rootObject;
  }

  console.log('request:', JSON.stringify(request))

  return request;
};