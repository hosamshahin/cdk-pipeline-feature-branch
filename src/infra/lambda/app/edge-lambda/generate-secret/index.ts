// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { randomBytes } from 'crypto';
import {
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';

export async function onEvent(event: any) {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      return generateSecret(event);

    case 'Delete':
      return { physicalResourceId: '', Data: {} };
  }
}

export function generateSecret(event: any) {
  console.log(JSON.stringify(event, undefined, 2));
  const { ResourceProperties } = event;

  const { PhysicalResourceId } = event as
    | CloudFormationCustomResourceDeleteEvent
    | CloudFormationCustomResourceUpdateEvent;

  const {
    Length = 16,
    AllowedCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',
  } = ResourceProperties;

  let physicalResourceId: string | undefined;

  physicalResourceId =
    PhysicalResourceId ||
    [...new Array(parseInt(Length))]
      .map(() => randomChoiceFromIndexable(AllowedCharacters)).join('');

  return {
    physicalResourceId,
    Data: { secret: physicalResourceId },
  };
};

function randomChoiceFromIndexable(indexable: string) {
  if (indexable.length > 256) {
    throw new Error(`indexable is too large: ${indexable.length}`);
  }
  const chunks = Math.floor(256 / indexable.length);
  const firstBiassedIndex = indexable.length * chunks;
  let randomNumber: number;
  do {
    randomNumber = randomBytes(1)[0];
  } while (randomNumber >= firstBiassedIndex);
  const index = randomNumber % indexable.length;
  return indexable[index];
}
