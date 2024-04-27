import os
import json
import re
import logging
import hmac
import hashlib
import boto3
import uuid

branch_prefix = os.getenv("branchPrefix")
github_secret = os.getenv("githubSecretUUIDValue")
codebuild_project_name = os.getenv("codeBuildProjectName")
pipeline_stack_name = os.getenv("pipelineStackName")

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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


def delete_stack(stack_name):
    cf_client = boto3.client('cloudformation')
    template_response = cf_client.get_template(StackName=stack_name)
    template_json = template_response['TemplateBody']

    # Extract the resource name
    resource_type="AWS::CodePipeline::Pipeline"

    # Iterate over the resources in the template
    pipeline_properties = {}
    for resource_id, resource_properties in template_json['Resources'].items():
        if resource_properties.get('Type') == resource_type:
            pipeline_properties = resource_properties['Properties']
            break

    app_stack_name = None
    for stage in pipeline_properties['Stages']:
        for action in stage['Actions']:
            if action['ActionTypeId']['Category'] == 'Deploy':
                app_stack_name = action['Configuration']['StackName']
                break

    print(app_stack_name)
    cf_client.delete_stack(StackName=stack_name)
    logger.info('successfully deleted CloudFormation stack:{}'.format(stack_name))
    cf_client.delete_stack(StackName=app_stack_name)
    logger.info('successfully deleted CloudFormation stack:{}'.format(app_stack_name))


def trigger_code_build(project_name, branch_name):
    codebuild_client = boto3.client("codebuild")
    response = codebuild_client.start_build(
        projectName=project_name,
        environmentVariablesOverride=[
            {
                "name": "BRANCH_NAME",
                "value": branch_name,
                "type": "PLAINTEXT"
            }
        ],
        sourceVersion=branch_name,
    )


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
            if event_type == 'create':
                parts = ref.split("/")
                branch_name = parts[-1]
                if branch_name_check(branch_name, branch_prefix):
                    logger.info(f"Create new stack for: {branch_name}")
                    trigger_code_build(codebuild_project_name, branch_name)
                    msg = f"Done feature pipeline generation for: {branch_name}"
                else:
                    msg = f"Branch name {branch_name} does not match the prefix {branch_prefix}"
            # delete pipeline and app
            elif event_type == 'delete':
                branch_name = ref
                if branch_name_check(branch_name, branch_prefix):

                    stack_name = pipeline_stack_name.replace("BRANCH_NAME", branch_name)
                    delete_stack(stack_name)

                    msg = f"Done stacks deletion for: {branch_name}"
                else:
                    msg = f"Branch name {branch_name} does not match the prefix {branch_prefix}"

        else:
            msg = 'Not one of the following events: ["Branch creation", "Branch deletion"]'

    except Exception as e:
        msg = f"Error: {str(e)}"

    logger.info(msg)
    return {"statusCode": 200, "body": json.dumps(msg)}