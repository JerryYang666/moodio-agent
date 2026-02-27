import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  jsonb,
  bigint,
  unique,
  doublePrecision,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Users table
 * Stores user account information
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  authProvider: varchar("auth_provider", { length: 50 })
    .notNull()
    .default("email"), // 'email', 'cwru_sso', etc.
  authProviderMetadata: jsonb("auth_provider_metadata"), // Provider-specific metadata (e.g., studentId for CWRU)
  roles: jsonb("roles").$type<string[]>().notNull().default(["new_user"]), // Array of role names
  testingGroups: jsonb("testing_groups").$type<string[]>().notNull().default([]), // Array of testing group UUIDs
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * OTPs table
 * Stores one-time passwords for email verification
 */
export const otps = pgTable("otps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Refresh Tokens table
 * Stores active refresh tokens for authentication
 */
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  sessionExpiresAt: timestamp("session_expires_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Invitation Codes table
 * Stores generated invitation codes (not linked to specific emails)
 */
export const invitationCodes = pgTable("invitation_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  status: varchar("status", { length: 20 }).default("unused").notNull(), // 'unused', 'used'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Chats table
 * Stores chat session metadata
 * Actual chat content is stored in S3
 */
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }), // Can be null/empty initially
  thumbnailImageId: varchar("thumbnail_image_id", { length: 255 }),
  deletedAt: timestamp("deleted_at"), // Soft delete - null means not deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Projects table
 * Top-level container for organizing assets and collections
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Collections table
 * Second-level container under projects for organizing generated images
 */
export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Collection Images table
 * Stores assets (images and videos) within projects, optionally within a collection, along with their generation details
 *
 * ID Strategy:
 * - imageId: Always the thumbnail/display image (S3 image ID for images, thumbnail ID for videos)
 * - assetId: The actual asset reference (same as imageId for images, S3 video ID for videos)
 * - assetType: "image" or "video"
 */
export const collectionImages = pgTable("collection_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Nullable: an asset can live at the project root (no collection)
  collectionId: uuid("collection_id").references(() => collections.id, {
    onDelete: "cascade",
  }),
  imageId: varchar("image_id", { length: 255 }).notNull(), // Thumbnail/display image ID (S3 image ID)
  assetId: varchar("asset_id", { length: 255 }).notNull(), // Actual asset ID (same as imageId for images, video ID for videos)
  assetType: varchar("asset_type", { length: 20 }).notNull().default("image"), // "image" or "video"
  chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }), // Which chat this image came from
  generationDetails: jsonb("generation_details").notNull(), // Prompt, title, status, etc.
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

/**
 * Collection Shares table
 * Manages sharing permissions for collections
 */
export const collectionShares = pgTable("collection_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  sharedWithUserId: uuid("shared_with_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull(), // 'viewer' or 'collaborator'
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
});

/**
 * Passkeys table
 * Stores WebAuthn credentials for passwordless authentication
 */
export const passkeys = pgTable("passkeys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: text("transports"), // JSON string of transports array
  deviceType: varchar("device_type", { length: 32 })
    .notNull()
    .default("singleDevice"),
  backedUp: boolean("backed_up").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
});

/**
 * Auth Challenges table
 * Stores temporary challenges for WebAuthn ceremonies
 */
export const authChallenges = pgTable("auth_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Events table
 * Stores telemetry data
 */
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 255 }),
  metadata: jsonb("metadata").notNull(),
});

/**
 * Video Generations table
 * Stores video generation requests and their results
 */
export const videoGenerations = pgTable("video_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  modelId: varchar("model_id", { length: 255 }).notNull(),
  falRequestId: varchar("fal_request_id", { length: 255 }), // For webhook correlation
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, processing, completed, failed
  sourceImageId: varchar("source_image_id", { length: 255 }).notNull(),
  endImageId: varchar("end_image_id", { length: 255 }),
  videoId: varchar("video_id", { length: 255 }), // S3 video ID
  thumbnailImageId: varchar("thumbnail_image_id", { length: 255 }),
  params: jsonb("params").notNull(), // User-provided + defaults merged
  error: text("error"),
  seed: bigint("seed", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

/**
 * User Credits table
 * Stores user credit balances
 */
export const userCredits = pgTable("user_credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Credit Transactions table
 * Stores credit transaction history
 */
export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(), // positive for credits, negative for debits
  type: varchar("type", { length: 50 }).notNull(), // 'admin_grant', 'video_generation', 'refund', etc.
  description: text("description"),
  performedBy: uuid("performed_by").references(() => users.id), // admin who performed the action
  // Link to related entity (e.g., video generation)
  relatedEntityType: varchar("related_entity_type", { length: 50 }), // 'video_generation', etc.
  relatedEntityId: uuid("related_entity_id"), // ID of the related entity
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Model Pricing table
 * Stores admin-configurable pricing formulas for video models
 * 
 * Formulas use expr-eval syntax with model params as variables.
 * Example: "100 * (resolution == '1080p' ? 1.5 : 1) + (generate_audio ? 50 : 0)"
 */
export const modelPricing = pgTable("model_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: varchar("model_id", { length: 255 }).notNull().unique(),
  formula: text("formula").notNull(), // expr-eval expression
  description: text("description"), // Admin notes about the formula
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Export types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OTP = typeof otps.$inferSelect;
export type NewOTP = typeof otps.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export type InvitationCode = typeof invitationCodes.$inferSelect;
export type NewInvitationCode = typeof invitationCodes.$inferInsert;

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type CollectionImage = typeof collectionImages.$inferSelect;
export type NewCollectionImage = typeof collectionImages.$inferInsert;

export type CollectionShare = typeof collectionShares.$inferSelect;
export type NewCollectionShare = typeof collectionShares.$inferInsert;

export type Passkey = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;

export type AuthChallenge = typeof authChallenges.$inferSelect;
export type NewAuthChallenge = typeof authChallenges.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type VideoGeneration = typeof videoGenerations.$inferSelect;
export type NewVideoGeneration = typeof videoGenerations.$inferInsert;

export type UserCredit = typeof userCredits.$inferSelect;
export type NewUserCredit = typeof userCredits.$inferInsert;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;

export type ModelPricing = typeof modelPricing.$inferSelect;
export type NewModelPricing = typeof modelPricing.$inferInsert;

/**
 * Testing Groups table
 * Stores testing/experiment groups for AB testing
 */
export const testingGroups = pgTable("testing_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Feature Flags table
 * Stores feature flag definitions with default values
 */
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 16 }).notNull().unique(),
  valueType: varchar("value_type", { length: 10 }).notNull(), // 'boolean' | 'number' | 'string'
  defaultValue: text("default_value").notNull(), // Fallback for all users
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true), // Kill switch
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Group Flag Overrides table
 * Stores flag value overrides for specific testing groups
 */
export const groupFlagOverrides = pgTable(
  "group_flag_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => testingGroups.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueFlagGroup: unique().on(table.flagId, table.groupId),
  })
);

export type TestingGroup = typeof testingGroups.$inferSelect;
export type NewTestingGroup = typeof testingGroups.$inferInsert;

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

export type GroupFlagOverride = typeof groupFlagOverrides.$inferSelect;
export type NewGroupFlagOverride = typeof groupFlagOverrides.$inferInsert;

/**
 * Desktops table
 * Standalone infinite canvases where users arrange generated assets spatially
 */
export const desktops = pgTable("desktops", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  viewportState: jsonb("viewport_state").$type<{
    x: number;
    y: number;
    zoom: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Desktop Shares table
 * Manages sharing permissions for desktops (mirrors collectionShares pattern)
 */
export const desktopShares = pgTable("desktop_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  desktopId: uuid("desktop_id")
    .notNull()
    .references(() => desktops.id, { onDelete: "cascade" }),
  sharedWithUserId: uuid("shared_with_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull(), // 'viewer' or 'collaborator'
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
});

/**
 * Desktop Assets table
 * Assets placed on a desktop canvas with spatial coordinates.
 * All asset-type-specific data lives in the polymorphic `metadata` JSONB column,
 * discriminated by `assetType`.
 */
export const desktopAssets = pgTable("desktop_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  desktopId: uuid("desktop_id")
    .notNull()
    .references(() => desktops.id, { onDelete: "cascade" }),
  assetType: varchar("asset_type", { length: 50 }).notNull(),
  metadata: jsonb("metadata").notNull(),
  posX: doublePrecision("pos_x").notNull(),
  posY: doublePrecision("pos_y").notNull(),
  width: doublePrecision("width"),
  height: doublePrecision("height"),
  rotation: doublePrecision("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(0),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export type Desktop = typeof desktops.$inferSelect;
export type NewDesktop = typeof desktops.$inferInsert;

export type DesktopShare = typeof desktopShares.$inferSelect;
export type NewDesktopShare = typeof desktopShares.$inferInsert;

export type DesktopAsset = typeof desktopAssets.$inferSelect;
export type NewDesktopAsset = typeof desktopAssets.$inferInsert;
