import json
import os
import boto3
from botocore.exceptions import ClientError

cognito = boto3.client('cognito-idp')

CLIENT_ID = os.environ['CLIENT_ID']

def lambda_handler(event, context):
    """
    Handle user signin with Cognito
    
    Expected Input:
    {
        "email": "user@example.com",
        "password": "SecurePass123"
    }
    
    Returns JWT tokens for authenticated user
    """
    try:
        # Parse request body
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        email = body.get('email', '').strip()
        password = body.get('password', '')
        
        # Validation
        if not email or not password:
            return response(400, {'error': 'Email and password are required'})
        
        # Authenticate user
        auth_response = cognito.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,
                'PASSWORD': password
            }
        )
        
        # Extract tokens
        auth_result = auth_response['AuthenticationResult']
        
        return response(200, {
            'message': 'Sign in successful',
            'accessToken': auth_result['AccessToken'],
            'idToken': auth_result['IdToken'],
            'refreshToken': auth_result['RefreshToken'],
            'expiresIn': auth_result['ExpiresIn'],
            'tokenType': auth_result['TokenType']
        })
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'NotAuthorizedException':
            return response(401, {'error': 'Incorrect email or password'})
        elif error_code == 'UserNotConfirmedException':
            return response(403, {'error': 'User account not confirmed'})
        elif error_code == 'UserNotFoundException':
            return response(404, {'error': 'User not found'})
        else:
            print(f"Cognito error: {error_code} - {error_message}")
            return response(500, {'error': 'Authentication failed'})
            
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return response(500, {'error': 'Internal server error'})

def response(status_code, body):
    """Helper function to format API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        'body': json.dumps(body)
    }
