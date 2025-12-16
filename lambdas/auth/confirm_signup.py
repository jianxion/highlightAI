import json
import os
import boto3
from botocore.exceptions import ClientError

cognito = boto3.client('cognito-idp')
CLIENT_ID = os.environ["CLIENT_ID"]

def lambda_handler(event, context):
    body = json.loads(event["body"])
    email = body["email"]
    code = body["code"]

    try:
        cognito.confirm_sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            ConfirmationCode=code
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"message": "User confirmed successfully"})
        }

    except ClientError as e:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)})
        }
