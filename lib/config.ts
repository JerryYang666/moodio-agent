/**
 * Configuration module for the control plane
 * Mirrors the functionality from backend/internal/config/config.go
 * 
 * Loads configuration from environment variables and AWS Secrets Manager.
 * AWS credentials are loaded by docker-entrypoint.sh from /home/nextjs/.aws/credentials
 * and exported as environment variables before the server starts.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Config, Secrets } from './types/config';

// Singleton instance
let cachedConfig: Config | null = null;
let configPromise: Promise<Config> | null = null;

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Load secrets from AWS Secrets Manager
 * Uses environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * that are set by the docker-entrypoint.sh script
 */
async function loadSecretsFromAWS(environment: string, awsRegion: string): Promise<Secrets> {
  console.log('[Config] Loading AWS configuration from environment variables');
  
  // Verify AWS credentials are available
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('[Config] WARNING: AWS credentials not found in environment variables');
    console.warn('[Config] Make sure docker-entrypoint.sh loaded credentials from /home/nextjs/.aws/credentials');
  }

  // Create Secrets Manager client - will use credentials from environment variables
  const client = new SecretsManagerClient({
    region: awsRegion,
  });

  // Build secret name based on environment
  const secretName = `platform-${environment}-secrets`;
  console.log(`[Config] Fetching secrets from AWS Secrets Manager: ${secretName}`);

  try {
    // Get secret value
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });
    const result = await client.send(command);

    if (!result.SecretString) {
      throw new Error('Secret value is empty');
    }

    // Parse JSON secrets
    const secrets: Secrets = JSON.parse(result.SecretString);
    console.log('[Config] Secrets loaded successfully from AWS Secrets Manager');

    return secrets;
  } catch (error) {
    console.error('[Config] Failed to load secrets from AWS:', error);
    throw new Error(`Failed to get secret value: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load configuration from environment variables and AWS Secrets Manager
 * This function implements singleton pattern with in-memory caching
 */
async function loadConfig(): Promise<Config> {
  // Return cached config if available
  if (cachedConfig) {
    console.log('[Config] Returning cached configuration');
    return cachedConfig;
  }

  // Return in-flight promise if already loading
  if (configPromise) {
    console.log('[Config] Configuration loading in progress, waiting...');
    return configPromise;
  }

  // Start loading configuration
  configPromise = (async () => {
    console.log('[Config] Starting configuration load');

    const environment = getEnv('ENVIRONMENT', 'dev');
    const port = getEnv('PORT', '3002');
    const awsRegion = getEnv('AWS_REGION', 'us-east-2');

    console.log(`[Config] Environment: ${environment}, Port: ${port}, AWS Region: ${awsRegion}`);

    try {
      // Fetch secrets from AWS Secrets Manager
      const secrets = await loadSecretsFromAWS(environment, awsRegion);

      // Build config object
      const config: Config = {
        environment,
        port,
        awsRegion,
        databaseURL: secrets.database_url,
      };

      console.log('[Config] Configuration loaded successfully');

      // Cache the config
      cachedConfig = config;
      return config;
    } catch (error) {
      console.error('[Config] Failed to load configuration:', error);
      // Clear the promise so we can retry
      configPromise = null;
      throw error;
    }
  })();

  return configPromise;
}

/**
 * Get configuration (loads and caches on first call)
 * This is the main entry point for accessing configuration
 */
export async function getConfig(): Promise<Config> {
  return loadConfig();
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configPromise = null;
  console.log('[Config] Configuration cache cleared');
}

