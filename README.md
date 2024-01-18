
TODO:
- explain project folder structure and each construct and stack

Introduction

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

Before setting up the project let's go through the project folder strcutre and learn more about the CDK constructs and stacks. What we have here is a typical CDK app created using projen. All source code goes under src folder and CDK tests can be found under test folder. The src folder contains a simple react appliation under client folder and infra folder contains the CDK constructs/stacks for the deployment pipelines, solution infrastructure compoements, and serverless application resources.

./src/infra/app contains all the application resources in one stack. for example AWS Lambda , API Gateway, CloudFront, DynamoDB, and S3 bucket
./src/infra/cicd/app-pipeline-construct.ts the application pipeline that creates a CDK Pipeline used to provision the application stack under ./src/infra/app.
./src/infra/cicd/database-pipeline-construct.ts the database construct which creates a separate CDK pipelines that provisions an RDS database in both development and procudtino accounts. Note, The databse pipeline also provisions a lambda function which uses Prisma to apply database migrations. If you choose to use the database pipeline you can write your initial databse schema migrations under ./src/infra/lambda/prisma/prisma/migrations. The piepline will automatically trigger the lambda fucntion which applies the migrations. Moving forward, you can add more migrations which would be applied automaticaaly by the application pipeline where all feature branches pieplines migrations would be applied to developemtn database and migrations mierged to main branch will be applied to production dataase.
./src/infra/cicd/lambda contains all the lambda fucntin code use by the serverlwess applciation of the infrastructure.
./src/infra/script contans the CDK bootstraping script
./src/infra/shared contains sahred CDK constructs and stacks used to setup the infrastructure.

## Prerequisites

- An AWS maangment account
- Create an organization with one OU then create thee accounts under it
- it is recommened to set up IAM idenety center for a single sign on for your organization
https://youtu.be/_KhrGFV_Npw?si=tyUzpLz4iB72k1XP
- AWS CDK installed

## Initial Setup
- Fork this repo under your name then clone it.
- install dependency by installing porjen
- npm install projen
- take a note of cicd, dev, and prod accounts Ids you created previously and update .projenrc.ts file with the accounts Ids, gethub org and repo name.
- run vpx projen to update config files
- update your local ~/.aws/credentials file with the CICD/DEV/PRD accounts creditional. You can get the tempraty credintiaols form the idently center SSO login screen. Expand the CICD/DEV/PRD accounts and selelct "Command line or programmatic access" then copy the "Short-term credentials" into ~/.aws/credentials and name the profile cicd/dev/prd.
- Bootstrap your enviromants by using ./src/infra/script/bootstrap.sh script
- login to cicd account and create a connection to gethub
https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html#connections-github-console


# Provision github webhook stack
The stack contains api gate way (the webhook URL) backed by lambda functin which manges feature branch life cycle. it also provides a secres string to secure the webhook endpoint.

from the root of repo execute this commend

cdk deploy GithubWebhookAPIStack --profile cicd -c TargetStack=GithubWebhookAPIStack

after the stack got deployed navigate to the stack output and copy secretuuid and webhookurl values.

go to your github repo and configure the webhook. Under setting/webhook click add  webhook. Add the value of webhookurl to `payload URL` and the value of `secretuuid` to `Secret` then cllick `Add webhook`. to check the webhook is working corrctly go to the `Recent Deliveris` tab you should see a successful `ping` message.

# Provision cross account auth secret
The sample serverless app used to demo this solution supports social login using Google's OAuth 2.0 APIs.




- explain project folder structure and each construct and stack






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







