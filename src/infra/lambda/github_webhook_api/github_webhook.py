import os
import json
import re
import logging
import hmac
import hashlib
import boto3

branch_prefix = os.getenv("branchPrefix")
feature_pipeline_suffix = os.getenv("featurePipelineSuffix")
pipeline_template = os.getenv("pipelineTemplate")
dev_account = os.getenv("devAccount")
github_secret = os.getenv("githubSecretUUIDValue")
adminRoleFromCicdAccount = os.getenv("adminRoleFromCicdAccount")

codepipeline_client = boto3.client("codepipeline")
sm_client = boto3.client("secretsmanager")
ssm_client = boto3.client("ssm")

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_github_webhook_secret_from_secretsmanager(github_webhook_secret):
    response = sm_client.get_secret_value(
        SecretId=github_webhook_secret,
    )
    if "SecretString" in response:
        secret = json.loads(response["SecretString"]).get(github_webhook_secret)
    return secret


def branch_name_check(branch_name, branch_prefix):
    if re.match(branch_prefix, branch_name):
        return True
    else:
        return False

def verify_signature(payload_body, secret_token, signature_header):
    hash_object = hmac.new(secret_token.encode('utf-8'),
                           msg=payload_body.encode('utf-8'),
                           digestmod=hashlib.sha256)
    expected_signature = "sha256=" + hash_object.hexdigest()
    print(expected_signature)
    print(signature_header)
    return hmac.compare_digest(expected_signature, signature_header)

def save_branch_name_in_ssm(branch_name):
    branch_chars = re.sub("[^0-9a-zA-Z-]+", "", str(branch_name))

    response = ssm_client.put_parameter(
        Name=branch_chars, Value=branch_name, Type="String", Overwrite=True
    )


def delete_branch_name_in_ssm(branch_name):
    branch_chars = re.sub("[^0-9a-zA-Z-]+", "", str(branch_name))

    response = ssm_client.delete_parameter(Name=branch_chars)


def create_feature_pipeline_from_template(
    branch_name, pipeline_template, pipeline_name
):
    codepipeline_client = boto3.client("codepipeline")
    response = codepipeline_client.get_pipeline(
        name=pipeline_template,
    )

    pipeline_describe = response.get("pipeline", {})
    pipeline_describe["name"] = pipeline_name
    pipeline_describe["stages"][0]["actions"][0]["configuration"]["BranchName"] = branch_name

    print(json.dumps(pipeline_describe))
    stages = pipeline_describe["stages"]

    for i in range(len(stages)):
        stage = stages[i]
        actions = stage['actions']
        for j in range(len(actions)):
            action = actions[j]
            configuration = action['configuration']
            if 'StackName' in configuration.keys():
                stack_name = configuration['StackName']
                stages[i]['actions'][j]['configuration']['StackName'] = f"{branch_name}-{stack_name}"

    pipeline_describe["stages"] = stages
    print(json.dumps(pipeline_describe))

    response = codepipeline_client.create_pipeline(pipeline=pipeline_describe)


def delete_feature_pipeline(pipeline_name):
    codepipeline_client = boto3.client("codepipeline")
    response = codepipeline_client.delete_pipeline(name=pipeline_name)


def delete_stack(branch_name, pipeline_template, dev_account):
    role_arn=f"arn:aws:iam::{dev_account}:role/{adminRoleFromCicdAccount}"
    stack_name=''

    codepipeline_client = boto3.client("codepipeline")
    response = codepipeline_client.get_pipeline(
        name=pipeline_template,
    )

    pipeline_describe = response.get("pipeline", {})
    stages = pipeline_describe["stages"]

    for i in range(len(stages)):
        stage = stages[i]
        actions = stage['actions']
        for j in range(len(actions)):
            action = actions[j]
            configuration = action['configuration']
            if 'StackName' in configuration.keys():
                stack_name = configuration['StackName']

    stack_name = f"{branch_name}-{stack_name}"

    logger.info('stack_name:{}, role_arn:{}'.format(stack_name, role_arn))
    response = codepipeline_client.create_pipeline(pipeline=pipeline_describe)

    sts_client = boto3.client('sts')
    response = sts_client.assume_role(
        RoleArn=role_arn,
        RoleSessionName='CleanupChildStacks'
    )
    session = boto3.Session(
        aws_access_key_id=response['Credentials']['AccessKeyId'],
        aws_secret_access_key=response['Credentials']['SecretAccessKey'],
        aws_session_token=response['Credentials']['SessionToken']
    )
    cf_client = session.client('cloudformation')
    StackName = stack_name
    response = cf_client.delete_stack(
        StackName=StackName
    )
    waiter = cf_client.get_waiter('stack_delete_complete')
    waiter.wait(StackName=StackName)
    logger.info('successfully deleted CloudFormation stack:{}'.format(StackName))


def handler(event, context):
    logger.info(json.dumps(event))
    body_string = event.get("body")
    body = json.loads(body_string)
    headers = event.get("headers", {})
    event_type = headers['X-GitHub-Event']
    signature = headers['X-Hub-Signature-256']
    ref = body.get("ref", "")
    ref_type = body.get("ref_type", "branch")
    logger.info(f"ref: {ref}, ref_type: {ref_type}, event_type: {event_type}")

    msg = ""
    try:
        if ref_type == "branch" and verify_signature(body_string, github_secret, signature):
            branch_name = ref
            # create pipeline and app
            if event_type == 'push':
                parts = ref.split("/")
                branch_name = parts[-1]
                if branch_name_check(branch_name, branch_prefix):
                    logger.info(f"Saving branch name to parameter store: {branch_name}")
                    save_branch_name_in_ssm(branch_name)

                    branch_chars = re.sub("[^0-9a-zA-Z-]+", "", str(branch_name))
                    pipeline_name = branch_chars + feature_pipeline_suffix
                    logger.info(
                        f"Generating pipeline {pipeline_name} for branch: {branch_name}"
                    )
                    create_feature_pipeline_from_template(
                        branch_name, pipeline_template, pipeline_name
                    )

                    msg = f"Done feature pipeline generation for: {branch_name}"
                else:
                    msg = f"Branch name {branch_name} does not match the prefix {branch_prefix}"
            # delete pipeline and app
            elif event_type == 'delete':
                branch_name = ref
                if branch_name_check(branch_name, branch_prefix):
                    logger.info(f"Deleting branch name from parameter store: {branch_name}")
                    delete_branch_name_in_ssm(branch_name)

                    branch_chars = re.sub("[^0-9a-zA-Z-]+", "", str(branch_name))
                    pipeline_name = branch_chars + feature_pipeline_suffix
                    logger.info(
                        f"Dropping pipeline {pipeline_name} for branch: {branch_name}"
                    )
                    delete_feature_pipeline(pipeline_name)
                    delete_stack(branch_name, pipeline_template, dev_account)

                    msg = f"Done feature pipeline deletion for: {branch_name}"
                else:
                    msg = f"Branch name {branch_name} does not match the prefix {branch_prefix}"

        else:
            msg = 'Not one of the following events: ["Branch creation", "Branch deletion"]'

    except Exception as e:
        msg = f"Error: {str(e)}"

    logger.info(msg)
    return {"statusCode": 200, "body": json.dumps(msg)}