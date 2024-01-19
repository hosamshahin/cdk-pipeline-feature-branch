
## Introduction

This project extends the AWS CDK Pipelines cabalivlities to supprt feature branch development. During development team members might need a short lived separate development enviroment provisioned for his own feature. This project provides the platform which automaticaaly creates a dedecated pipeline and an isolated enviroment when users create a new branch. It also take cares of tear down and clean up all infrastructre and pipeline when the branch is merged and deleted. This model allows developers to work independently and concurrently which increases development speed and more inportarnlty developers' statifaction.

This solution follows AWS best practics by adpting a multi-account startagy. Do deploy this solution you need 3 AWS accounts:
- CICD: this account contains only deployment pipline
- Develipment account: contains the developpment and all the feature branches enviorments workloads
- Production account: a dedicated account for production work loads.

This project uses a sample serverless applicatoin as an example. The application is presented in Extended CDK workshop. The application uses dynamodb as a data store, if the user wants to use a relational database instead the project includes a separeta RDS pipeline do manage the data base provisioning separatly if needed.

## Overview of the solution
![Architecture diagram](./diagram.svg)

## How it works

After deploying the pipeline when a developer crates a feature branch, github webhook sends a push message to the lambda function. The function inspects the message and if a new branch was created the function will make a copy of the template pipeline and configure it to listen to that branch. The new branch pipeline then got triggered and the application resoruce for that branch would be  provisioned in an isloated enviroment in the development account. Once the developer completes the feature, merges to the main branch, and deletes the feature branch, github webbhook sends another delete message to the lambda function which would tear down the dedicated pipeline and application resources in developent account. Notice that main branch has its own pipline which is configured to deplpy directly to the procustion account.

## Solution deeper dive

Before setting up the project let's go through the project folder strcutre and learn more about its CDK constructs and stacks. What we have here is a typical CDK app created using projen. All source code goes under src folder and CDK tests can be found under test folder. The src folder contains a simple react appliation under client folder and infra folder contains the CDK constructs/stacks for the deployment pipelines, solution infrastructure resources, and serverless application resources.

./src/infra/app contains all the application resources in one stack. for example AWS Lambda , API Gateway, CloudFront, DynamoDB, and S3 bucket
./src/infra/cicd/app-pipeline-construct.ts the application pipeline that creates a CDK Pipeline used to provision the application stack under ./src/infra/app.
./src/infra/cicd/database-pipeline-construct.ts the database construct which creates a separate CDK pipelines that provisions an RDS database in both development and procudtino accounts. Note, The databse pipeline also provisions a lambda function which uses Prisma to apply database migrations. If you choose to use the database pipeline you can write your initial databse schema migrations under ./src/infra/lambda/prisma/prisma/migrations. The piepline will automatically trigger the lambda fucntion which applies the migrations. Moving forward, you can add more migrations which would be applied automaticaaly by the application pipeline where all feature branches pieplines migrations would be applied to developemtn database and migrations mierged to main branch will be applied to production dataase.
./src/infra/cicd/lambda contains all the lambda fucntin code use by the serverlwess applciation of the infrastructure.
./src/infra/script contans the CDK bootstraping script
./src/infra/shared contains sahred CDK constructs and stacks used to setup the infrastructure.

## Prerequisites

- An AWS maangment account
- Create an organization with one OU then create thee accounts under it
- It is recommened to set up IAM idenety center for a single sign on for your organization
https://youtu.be/_KhrGFV_Npw?si=tyUzpLz4iB72k1XP
- AWS CDK installed

## Initial Setup
- Fork this repo under your name then clone it.
- Install dependency by installing porjen
```sh
npm install projen
```
- login to cicd account and create a connection to gethub
https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html#connections-github-console
- Take note of CICD/DEV/PRD accounts Ids you created previously and update .projenrc.ts file. Also update gethub org, repo name, codeStar connection ARN created in the previous step.
- Run `npx projen` to update config files
- Commit and push the changes to your repo
- Update your local `~/.aws/credentials` file with the CICD/DEV/PRD accounts creditional. You can get the tempraty credintiaols form the idently center SSO login screen. Expand the CICD/DEV/PRD accounts and selelct "Command line or programmatic access" then copy the "Short-term credentials" into ~/.aws/credentials and name the profile cicd/dev/prd.
- Bootstrap your enviromants by using `./src/infra/script/bootstrap.sh` script


# Provision github webhook stack
The stack contains api gate way (the webhook URL) backed by lambda functin which manges feature branch life cycle. it also provides a secres string to secure the webhook endpoint.

from the root of repo execute this commend

```sh
cdk deploy GithubWebhookAPIStack --profile cicd -c TargetStack=GithubWebhookAPIStack
```

after the stack got deployed navigate to the stack output and copy `secretuuid` and `webhookurl` values.

Go to your github repo and configure the webhook. Under setting/webhook click add  webhook. Add the value of `webhookurl` to `payload URL` and the value of `secretuuid` to `Secret` then click `Add webhook`. to check the webhook is working corrctly go to the `Recent Deliveris` tab you should see a successful `ping` message.

# Provision database pipeline (optional)
From the root of repo execute this commend

```sh
cdk deploy DBPipeline --profile cicd -c TargetStack=DBPipeline
```



# Provision application pipeline
As discussed eariler the application piepline consits of two separate pieplines created in one stack. `pipeline-prd` is dedicated for productino depplyent and `pipeline-cicd` is a template pipeline used to create a new pipeline for each feature branch.

From the root of repo execute this commend

```sh
cdk deploy Pipeline --profile cicd -c TargetStack=Pipeline
```

After the pipeine stack is provisioned go to codepipline you sould see two pipelines `pipeline-cicd` which should be failing and this is expected becasue it is only used as a template. The other pipeline `pipeline-prd` which is monitoring the main branh should be running. Wait for the pipeline to reach the approval gate then approvev it. One the pipeline is done switch to production account and go to cloudformation you shoud find a new stack `AppStage-AppStack` created. In the stack output you will find `CfnOutCloudFrontUrl` which holds the application url.

Note: if you have provisioned the database pieline and you want to continue applying Prisma migrations using the application piepine you need to set the `useRdsDataBase` parameter to `true`


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

- Encode the config above to Base64 format with online tool, and replace the dummy Key value of the Secret created above




## Known issue

If you are using a new CICD account for this solution you might find the application pipeline is falining due to codeBuild limited run concurncy. You can get aroung this issue by retrying the failed steps. But it is recommend to use AWS Service Quotas to submit a rquest to increase the `Concurrently running builds for Linux/Small environment` to 10.
https://us-east-1.console.aws.amazon.com/servicequotas/home?region=us-east-1#
You will need


prerequests
- aws management account
- organizatino and organization uints
- IAM idenetly ceneter.
- cdk bootstraping
- aws credintails file
- deploy the pipeline
- deploy sample application
- configure social login
- clean up
- github webhooks
-





Refrences
- https://github.com/wolfgangunger/cdk-codepipeline-multibranch
- https://github.com/aws-samples/lambdaedge-openidconnect-samples
- https://github.com/aws-samples/prisma-lambda-cdk
- https://github.com/aws-samples/extended-cdk-workshop-coffee-listing-app
- https://github.com/cloudcomponents/cdk-constructs/tree/master/examples/github-webhook-example
- Creating organization and OU with three accounts
- Using projen







