
## Introduction

This project extends the AWS CDK Pipelines capabilities to support feature branch development. Developers might need a short lived separate development environment provisioned for their own feature development. This project provides the platform which automatically creates a dedicated pipeline and an isolated environment when users create a new branch. It also takes care of tearing down and cleaning up all infrastructure and pipeline when the branch is merged and deleted. This model allows developers to work independently and concurrently which increases development speed and more importantly developers' satisfaction.

This solution follows AWS best practices by adopting a multi-account strategy. To deploy this solution you need 3 AWS accounts:
- CICD: This account contains only deployment pipelines.
- Development account: contains the development and all the feature branches environments workloads.
- Production account: a dedicated account for production work loads.

This project uses a sample serverless application as an example. The application is presented in the Extended CDK workshop. The application uses dynamodb as a data store. If the user wants to use a relational database instead the project includes a separate RDS pipeline to manage the database provisioning separately if needed.

https://catalog.us-east-1.prod.workshops.aws/workshops/071bbc60-6c1f-47b6-8c66-e84f5dc96b3f/en-US/10-introduction-and-setup#application-architecture

## Overview of the solution
![Architecture diagram](./diagram.svg)

## How it works

After deploying the pipeline when a developer creates a feature branch, github webhook sends a push message to the lambda function. The function inspects the message and if a new branch was created the function will make a copy of the `template pipeline` and configure it to listen to the new branch. The new branch pipeline then gets triggered and the application resources for that branch will be provisioned in an isolated environment in the development account. Once the developer completes the feature, merges to the main branch, and deletes the feature branch, github webhook sends another delete message to the lambda function which will tear down the dedicated pipeline and application resources in the development account. Notice that the `main` branch has its own pipeline which is configured to deploy directly to the production account.

## Project folder structure

Before setting up the project let's go through the project folder structure and learn more about its CDK constructs and stacks. What we have here is a typical CDK app created using projen. All source code goes under the `src` folder and CDK tests can be found under the `test` folder. The `src` folder contains a simple react application under the `client` folder and the `infra` folder contains the CDK constructs/stacks for the deployment pipelines, solution infrastructure resources, and serverless application resources.

- `./src/infra/app` contains all the application resources in one stack. For example AWS Lambda , API Gateway, CloudFront, DynamoDB, and S3 bucket
- `./src/infra/cicd/app-pipeline-construct.ts` the application pipeline that creates a CDK Pipeline used to provision the application stack under `./src/infra/app`.
- `./src/infra/cicd/database-pipeline-construct.ts` the database construct which creates a separate CDK pipeline that provisions an RDS database in both development and production accounts. Note, The database pipeline also provides a lambda function which uses Prisma to automatically apply database migrations. If you choose to use the database pipeline you can write your initial database schema migrations under `./src/infra/lambda/prisma/prisma/migrations`. The pipeline will automatically trigger the lambda function which applies the migrations. Moving forward, you can add more migrations which would be applied automatically by the application pipeline where all `feature branches` pipelines migrations would be applied to the development database and migrations mierged to the `main` branch will be applied to the production database.
- `./src/infra/cicd/lambda` contains all the lambda function code used by the serverless application and the infrastructure.
- `./src/infra/script` contains the CDK bootstrapping script
- `./src/infra/shared` contains shared CDK constructs and stacks used to set up the infrastructure.

## Prerequisites

- An AWS management account
- Create an organization with one OU then create thee accounts under it
- It is recommended to set up IAM identity center for a single sign on for your organization
- AWS CDK installed

https://aws.amazon.com/free/
https://docs.aws.amazon.com/organizations/latest/userguide/orgs_tutorials_basic.html
https://youtu.be/_KhrGFV_Npw?si=tyUzpLz4iB72k1XP
https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_install

## Initial Setup
- Fork this repo under your name then clone it.
- Install dependency by installing porjen
```sh
npm install projen
```
https://projen.io/
- login to CICD account and create a connection to github
https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html#connections-github-console
- Take note of CICD/DEV/PRD accounts Ids you created previously and update `.projenrc.ts` file. Also update github org, repo name, codeStar connection ARN created in the previous step.
- Run `npx projen` to update config files
- Commit and push the changes to your repo
- Update your local `~/.aws/credentials` file with the CICD/DEV/PRD accounts credentials. You can get the temporary credentials form the idently center SSO login screen. Expand the CICD/DEV/PRD accounts and select `Command line or programmatic access` then copy the `Short-term credentials` into `~/.aws/credentials` and name the profile cicd/dev/prd.
- Bootstrap your environments by using `./src/infra/script/bootstrap.sh` script


# Provision github webhook stack
The stack contains an api gateway (the webhook URL) backed by a lambda function which manages the feature branches life cycle. It also provides a secret string to secure the webhook endpoint.

- From the root of repo execute this command

```sh
cdk deploy GithubWebhookAPIStack --profile cicd -c TargetStack=GithubWebhookAPIStack
```

After the stack gets deployed navigate to the stack output and copy `secretuuid` and `webhookurl` values.

Go to your github repo and configure the webhook. Under `setting/webhook` click add  webhook. Add the value of `webhookurl` to `payload URL` and the value of `secretuuid` to `Secret` then click `Add webhook`. to check the webhook is working correctly go to the `Recent Deliveries' tab you should see a successful `ping` message.

# Provision database pipeline (optional)
From the root of repo execute this command

```sh
cdk deploy DBPipeline --profile cicd -c TargetStack=DBPipeline
```

# Provision application pipeline
As discussed earlier the application pipeline consists of two separate pipelines created in one stack. `pipeline-prd` is dedicated for production deployment and `pipeline-cicd` is a template pipeline used to create a new pipeline for each feature branch.

From the root of repo execute this command

```sh
cdk deploy Pipeline --profile cicd -c TargetStack=Pipeline
```
After the pipeline stack is provisioned go to codepipeline you should see two pipelines `pipeline-cicd` which should be failing and this is expected because it is only used as a template. The other pipeline `pipeline-prd` which is monitoring the `main` branch should be running. Wait for the pipeline to reach the approval gate then approve it. One the pipeline is done, switch to production account and go to cloudformation you should find a new stack `AppStage-AppStack` created. In the stack output you will find `CfnOutCloudFrontUrl` which holds the application url.

Note: if you have provisioned the database pipeline and you want to continue applying Prisma migrations using the application piepine you need to set the `useRdsDataBase` parameter to `true`
link to useRdsDataBase

https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines?region=us-east-1

## Configure Google's OAuth 2.0 Application
- Follow the instructions here to create Google's OAuth 2.0 Application.
https://developers.google.com/identity/openid-connect/openid-connect#appsetup
- Set the redirect URI to the cloudfront url `CfnOutCloudFrontUrl`/_callback
Make you add `/_callback` at the end of the url.
- Take note of the Google OAuth 2.0 credentials, including a client ID and client secret, to authenticate users and gain access to Google's APIs.
- Generate Public and Private keys
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -outform PEM -pubout -out public.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem;echo
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem;echo
```
7. Update the config below with Google App client ID and client secret, CloudFront distribution and Public/Private key generated above

```json
{
    "AUTH_REQUEST": {
        "client_id": "GOOGLE_CIENT_ID",
        "redirect_uri": "https://CLOUDFRONT_URL/_callback",
        "response_type": "code",
        "scope": "openid email"
    },
    "TOKEN_REQUEST": {
        "client_id": "GOOGLE_CIENT_ID",
        "redirect_uri": "https://CLOUDFRONT_URL/_callback",
        "grant_type": "authorization_code",
        "client_secret": "GOOGLE_CLIENT_SECRET"
    },
    "DISTRIBUTION": "amazon-oai",
    "AUTHN": "GOOGLE",
    "PRIVATE_KEY": "PRIVATE_KEY",
    "PUBLIC_KEY": "PUBLIC_KEY",
    "DISCOVERY_DOCUMENT": "https://accounts.google.com/.well-known/openid-configuration",
    "SESSION_DURATION": 3000,
    "BASE_URL": "https://accounts.google.com",
    "CALLBACK_PATH": "/_callback",
    "AUTHZ": "GOOGLE"
}
```
- Encode the config above to Base64 format with an online tool. Go to the application stack in DEV/PRD `AppStage-AppStack` , get the auth secret name from the output `CloudfrontAuthSecretOutput` then update the secret with the base64 encoded configuration. Note the secret should be a json object in this format
```json
{ "config": "base64EcodedConfig" }

```

## Test the feature branch capability

Create a new branch and name it `featring-testing` then push it to your repo. Open codepipeline in the CICD account you should see a new pipeline name `feature-testing-featurebacn` created. Wait until the pipeline completes execution switch to the DEV account you should see a new stack named `feature- testing` was created.

Delete the feature branch locally and form the remote repo, go to the codepipeline in CICD account you will find the feature branch pipien deleted. check the DEV account the cloudFormation stack for that branch should be deleted as well.


## Cleanup

Simply delete all cloudformation stacks in CICD/DEV/PRD accounts.

## Known issue

If you are using a new CICD account for this solution you might find the application pipeline is failing due to codeBuild limited run concurrency. You can get around this issue by retrying the failed steps. But it is recommended to use AWS Service Quotas to submit a request to increase the `Concurrently running builds for Linux/Small environment` to 10.
https://us-east-1.console.aws.amazon.com/servicequotas/home?region=us-east-1#


## Refrences
- The multi branch pipeine was inspired by @xyz work https://github.com/wolfgangunger/cdk-codepipeline-multibranch
- Using Prisma in lambda function in details can be found here https://github.com/aws-samples/prisma-lambda-cdk
- You can find the sample serverless app used as a demo here https://github.com/aws-samples/extended-cdk-workshop-coffee-listing-app
- A good reference for Github webhook impelentation https://github.com/cloudcomponents/cdk-constructs/tree/master/examples/github-webhook-example
- An example on how to use lamada@ edge to integrate iwth OIDC provider. https://github.com/aws-samples/lambdaedge-openidconnect-samples
