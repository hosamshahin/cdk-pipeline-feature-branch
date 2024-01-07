#!/bin/bash

CICD_ACCOUNT_ID=645278470600
DEV_ACCOUNT_ID=447515469915
PRD_ACCOUNT_ID=742169474962
REGION=eu-west-1

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$CICD_ACCOUNT_ID/$REGION --profile q_cicd

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$DEV_ACCOUNT_ID/$REGION --profile q_dev

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$PRD_ACCOUNT_ID/$REGION --profile q_prd