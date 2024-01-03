#!/bin/bash

CICD_ACCOUNT_ID=690901106489
DEV_ACCOUNT_ID=864571753663
PRD_ACCOUNT_ID=938711853848
REGION=us-east-1

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$CICD_ACCOUNT_ID/$REGION --profile profile_cicd

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$DEV_ACCOUNT_ID/$REGION --profile profile_dev

cdk bootstrap --trust $CICD_ACCOUNT_ID \
--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
aws://$PRD_ACCOUNT_ID/$REGION --profile profile_prd