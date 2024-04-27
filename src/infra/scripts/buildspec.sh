#!/bin/bash

# Install dependencies
npm install -g aws-cdk
npx cdk --version

# Install projen
cd $CODEBUILD_SRC_DIR && npm install projen

# Build and deploy
# cd $CODEBUILD_SRC_DIR/src/client && npm install && npm run build
cd $CODEBUILD_SRC_DIR/src/infra/lambda/app/auth && npm install --omit=dev
cd $CODEBUILD_SRC_DIR && npx cdk synth --output=$CODEBUILD_SRC_DIR/cdk.out -c TargetStack=Pipeline -c BranchName=$BRANCH_NAME

