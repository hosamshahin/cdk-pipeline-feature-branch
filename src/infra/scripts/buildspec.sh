#!/bin/bash

# Install dependencies
apt-get --allow-releaseinfo-change -y update
apt-get install -y jq
npm install -g npm@8.19.4
npm -g uninstall aws-cdk
npm -g install aws-cdk@2.96.2
npx cdk --version

# Install projen
cd $CODEBUILD_SRC_DIR && npm install projen

# Build and deploy
cd $CODEBUILD_SRC_DIR/src/client && npm install && npm run build
cd $CODEBUILD_SRC_DIR && npx cdk synth --output=$CODEBUILD_SRC_DIR/cdk.out -c TargetStack=Pipeline -c BranchName=$BRANCH_NAME
