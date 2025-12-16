import json
import os
import boto3
from botocore.exceptions import ClientError

cognito = boto3.client('cognito-idp')

CLIENT_ID = os.environ['CLIENT_ID']

def lambda_handler(event, context):
    """
    Handle user signup with Cognito
    
    Expected Input:
    {
        "email": "user@example.com",
        "password": "SecurePass123",
        "name": "John Doe"
    }
    """
    try:
        # Parse request body
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        email = body.get('email', '').strip()
        password = body.get('password', '')
        name = body.get('name', '').strip()
        
        # Validation
        if not email or not password:
            return response(400, {'error': 'Email and password are required'})
        
        if len(password) < 8:
            return response(400, {'error': 'Password must be at least 8 characters'})
        
        # Sign up user
        user_attributes = [
            {'Name': 'email', 'Value': email}
        ]
        
        if name:
            user_attributes.append({'Name': 'name', 'Value': name})
        
        signup_response = cognito.sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            Password=password,
            UserAttributes=user_attributes
        )
        
        return response(201, {
            'message': 'User created successfully',
            'userId': signup_response['UserSub'],
            'email': email
        })
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        if error_code == 'UsernameExistsException':
            return response(409, {'error': 'User already exists'})
        elif error_code == 'InvalidPasswordException':
            return response(400, {'error': 'Password does not meet requirements'})
        elif error_code == 'InvalidParameterException':
            return response(400, {'error': error_message})
        else:
            print(f"Cognito error: {error_code} - {error_message}")
            return response(500, {'error': 'Failed to create user'})
            
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
