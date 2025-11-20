/**
 * Database type definitions for the control plane
 * These match the PostgreSQL schema for managing secondaries
 */

export type SchemaType =
  | "invoice"
  | "purchase_order"
  | "receipt"
  | "chart_of_accounts"
  | "vendor";

export interface Secondary {
  secondary_id: string;
  primary_id: string;
  name: string;
  owner_id: string;
  s3_bucket: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EmailReceiptSecondaryMembership {
  membership_id: string;
  secondary_id: string;
  email_receipt_address: string;
  created_at: string;
  updated_at: string;
}

export interface Schema {
  schema_id: string;
  secondary_id: string;
  schema_type: SchemaType;
  version: string;
  schema_data: any; // JSONB data
  created_at: string;
  updated_at: string;
}

export interface User {
  user_id: string;
  cognito_sub: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SecondaryRoleMembership {
  membership_id: string;
  secondary_id: string;
  role_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SecondaryRoleDefinition {
  role_id: string;
  secondary_id: string;
  role_name: string;
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// API Response types
export interface SecondariesListResponse {
  secondaries: Secondary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserWithRole extends User {
  role_id: string;
  role_name: string;
  membership_id: string;
}

// API Request types
export interface SecondariesListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateSecondaryRequest {
  name?: string;
  owner_id?: string;
  s3_bucket?: string;
}

export interface CreateEmailRequest {
  email_receipt_address: string;
}

export interface CreateSchemaRequest {
  schema_type: SchemaType;
  version: string;
  schema_data: any;
}

export interface UpdateSchemaRequest {
  version?: string;
  schema_data?: any;
}

export interface CreateUserRoleRequest {
  user_id: string;
  role_id: string;
}

export interface UpdateUserRoleRequest {
  role_id: string;
}
