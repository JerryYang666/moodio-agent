#!/bin/sh
set -e

echo "[CONTROL] Loading AWS credentials from /home/nextjs/.aws/credentials..."

# Check if AWS credentials file exists
if [ ! -f /home/nextjs/.aws/credentials ]; then
    echo "[CONTROL] WARNING: AWS credentials file not found at /home/nextjs/.aws/credentials"
    echo "[CONTROL] Attempting to start without explicit credentials (will use IMDS if available)"
else
    # Parse AWS credentials file and export as environment variables
    # Look for the [default] profile or first available profile
    
    # Extract AWS_ACCESS_KEY_ID
    AWS_ACCESS_KEY_ID=$(grep -A 2 '\[default\]' /home/nextjs/.aws/credentials 2>/dev/null | grep 'aws_access_key_id' | cut -d '=' -f 2 | tr -d ' ' || echo "")
    
    # Extract AWS_SECRET_ACCESS_KEY
    AWS_SECRET_ACCESS_KEY=$(grep -A 2 '\[default\]' /home/nextjs/.aws/credentials 2>/dev/null | grep 'aws_secret_access_key' | cut -d '=' -f 2 | tr -d ' ' || echo "")
    
    # Extract AWS_SESSION_TOKEN if present
    AWS_SESSION_TOKEN=$(grep -A 3 '\[default\]' /home/nextjs/.aws/credentials 2>/dev/null | grep 'aws_session_token' | cut -d '=' -f 2 | tr -d ' ' || echo "")
    
    # Export credentials if found
    if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
        export AWS_ACCESS_KEY_ID
        export AWS_SECRET_ACCESS_KEY
        echo "[CONTROL] ✓ AWS credentials loaded successfully"
        
        if [ -n "$AWS_SESSION_TOKEN" ]; then
            export AWS_SESSION_TOKEN
            echo "[CONTROL] ✓ AWS session token loaded"
        fi
    else
        echo "[CONTROL] WARNING: Could not parse AWS credentials from file"
        echo "[CONTROL] Attempting to start without explicit credentials"
    fi
fi

echo "[CONTROL] Starting Next.js server on port ${PORT:-3002}..."

# Start the Next.js server
exec node server.js

