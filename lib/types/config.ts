/**
 * Configuration type definitions for the control plane
 * Mirrors the structure from backend/internal/config/config.go
 */

/**
 * Main configuration interface
 */
export interface Config {
  environment: string;
  port: string;
  awsRegion: string;
  databaseURL: string;
}

/**
 * AWS Secrets Manager structure
 * Matches the JSON format from AWS Secrets Manager: platform-{environment}-secrets
 */
export interface Secrets {
  database_url: string;
  cognito_user_pool_id: string;
  cognito_client_id: string;
  openai_api_key: string;
  temporal_api_base: string;
  temporal_api_key: string;
  temporal_namespace: string;
  ses_sender_email: string;
  frontend_url: string;
}
