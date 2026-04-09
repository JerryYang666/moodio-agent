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
  smallint,
  index,
  type AnyPgColumn,
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
  passwordHash: text("password_hash"),
  roles: jsonb("roles").$type<string[]>().notNull().default(["new_user"]), // Array of role names
  testingGroups: jsonb("testing_groups").$type<string[]>().notNull().default([]), // Array of testing group UUIDs
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
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
 * Folders table
 * Unlimited-depth nested containers under collections.
 * Uses ltree materialized path for fast subtree queries.
 */
export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
    onDelete: "cascade",
  }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  path: text("path").notNull(),
  depth: integer("depth").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
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
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "cascade",
  }),
  imageId: varchar("image_id", { length: 255 }).notNull(), // Thumbnail/display image ID (S3 image ID)
  assetId: varchar("asset_id", { length: 255 }).notNull(), // Actual asset ID (same as imageId for images, video ID for videos)
  assetType: varchar("asset_type", { length: 20 }).notNull().default("image"), // "image" or "video"
  chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }), // Which chat this image came from
  generationDetails: jsonb("generation_details").notNull(), // Prompt, title, status, etc.
  rating: integer("rating"), // 1-5 star rating, null = unrated
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

/**
 * Project Shares table
 * Manages sharing permissions for projects
 */
export const projectShares = pgTable("project_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sharedWithUserId: uuid("shared_with_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull(), // 'viewer' or 'collaborator'
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
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
 * Folder Shares table
 * Manages sharing permissions for folders (mirrors collection_shares pattern)
 */
export const folderShares = pgTable("folder_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  folderId: uuid("folder_id")
    .notNull()
    .references(() => folders.id, { onDelete: "cascade" }),
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
  provider: varchar("provider", { length: 50 }),
  providerModelId: varchar("provider_model_id", { length: 255 }),
  providerRequestId: varchar("provider_request_id", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  sourceImageId: varchar("source_image_id", { length: 255 }).notNull(),
  endImageId: varchar("end_image_id", { length: 255 }),
  videoId: varchar("video_id", { length: 255 }),
  thumbnailImageId: varchar("thumbnail_image_id", { length: 255 }),
  params: jsonb("params").notNull(),
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
 * Stores credit transaction history for both personal (user) and team accounts.
 * accountId is polymorphic: references users.id when accountType='personal',
 * or teams.id when accountType='team'. No DB-level FK (application-validated).
 */
export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  accountType: varchar("account_type", { length: 20 }).notNull().default("personal"), // 'personal' | 'team'
  amount: bigint("amount", { mode: "number" }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  description: text("description"),
  performedBy: uuid("performed_by").references(() => users.id),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: varchar("related_entity_id", { length: 255 }),
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

/**
 * Collection Tags table
 * Stores user-defined tags on collections with preset colors
 */
export const collectionTags = pgTable("collection_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(), // Preset color key (e.g. "red", "blue", "green")
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type CollectionTag = typeof collectionTags.$inferSelect;
export type NewCollectionTag = typeof collectionTags.$inferInsert;

export type CollectionImage = typeof collectionImages.$inferSelect;
export type NewCollectionImage = typeof collectionImages.$inferInsert;

export type ProjectShare = typeof projectShares.$inferSelect;
export type NewProjectShare = typeof projectShares.$inferInsert;

export type CollectionShare = typeof collectionShares.$inferSelect;
export type NewCollectionShare = typeof collectionShares.$inferInsert;

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;

export type FolderShare = typeof folderShares.$inferSelect;
export type NewFolderShare = typeof folderShares.$inferInsert;

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
 * Research Events table
 * Captures implicit preference signals from user behavior during creative AI sessions.
 * Separate from operational telemetry (events table) — used for research analysis only.
 */
export const researchEvents = pgTable(
  "research_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }),
    sessionId: varchar("session_id", { length: 255 }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    turnIndex: integer("turn_index"),
    imageId: varchar("image_id", { length: 255 }),
    imagePosition: smallint("image_position"),
    variantId: varchar("variant_id", { length: 255 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userChatCreatedIdx: index("research_events_user_chat_created_idx").on(
      table.userId,
      table.chatId,
      table.createdAt
    ),
    eventTypeCreatedIdx: index("research_events_event_type_created_idx").on(
      table.eventType,
      table.createdAt
    ),
    chatCreatedIdx: index("research_events_chat_created_idx").on(
      table.chatId,
      table.createdAt
    ),
  })
);

export type ResearchEvent = typeof researchEvents.$inferSelect;
export type NewResearchEvent = typeof researchEvents.$inferInsert;

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

/**
 * Teams table
 * A user can create multiple teams; ownerId is not unique.
 */
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Team Members table
 * Tracks membership and within-team roles.
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"), // 'owner' | 'admin' | 'member'
    tag: varchar("tag", { length: 50 }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueTeamUser: unique().on(table.teamId, table.userId),
  })
);

/**
 * Team Invitations table
 * Pending email-based invitations to join a team.
 */
export const teamInvitations = pgTable("team_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'expired' | 'cancelled'
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Team Credits table
 * One balance record per team (mirrors userCredits structure).
 */
export const teamCredits = pgTable("team_credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .unique()
    .references(() => teams.id, { onDelete: "cascade" }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;

export type TeamCredit = typeof teamCredits.$inferSelect;
export type NewTeamCredit = typeof teamCredits.$inferInsert;

/**
 * User Active Accounts table
 * Stores which credit account (personal or team) each user is currently billing to.
 * Absence of a row means "personal" (the default).
 */
export const userActiveAccounts = pgTable("user_active_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  accountType: varchar("account_type", { length: 20 }).notNull().default("personal"), // 'personal' | 'team'
  accountId: uuid("account_id"), // null = personal (userId is implicit); teamId when accountType='team'
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserActiveAccount = typeof userActiveAccounts.$inferSelect;
export type NewUserActiveAccount = typeof userActiveAccounts.$inferInsert;

/**
 * User Consents table
 * Records when users accept legal agreements (Terms, Privacy, AUP).
 * A new row is inserted each time the user accepts a new version.
 * California law requires 3+ years retention.
 */
export const userConsents = pgTable("user_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  consentType: varchar("consent_type", { length: 20 }).notNull().default("login"), // 'login' | 'payment'
  termsVersion: varchar("terms_version", { length: 20 }).notNull(), // e.g. "2026-03-24"
  acceptedFromIp: varchar("accepted_from_ip", { length: 100 }),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
});

export type UserConsent = typeof userConsents.$inferSelect;
export type NewUserConsent = typeof userConsents.$inferInsert;

/**
 * Subscriptions table
 * Tracks active Stripe subscription state per user.
 */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 })
    .notNull()
    .unique(),
  stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("incomplete"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

/**
 * Subscription Plans table
 * Admin-configurable subscription plans. The checkout route reads the active
 * plan from this table — no env var needed. Single-tier for now, extensible.
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull().unique(),
  priceCents: integer("price_cents").notNull(),
  interval: varchar("interval", { length: 20 }).notNull().default("month"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

/**
 * Credit Packages table
 * Admin-configurable one-time credit purchase packages.
 */
export const creditPackages = pgTable("credit_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  credits: integer("credits").notNull(),
  priceCents: integer("price_cents").notNull(),
  stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;

/**
 * Stripe Events table
 * Audit log of every Stripe webhook event received.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_stripe_events_type").on(table.eventType),
  index("idx_stripe_events_user").on(table.userId),
  index("idx_stripe_events_created").on(table.createdAt),
]);

export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;

// ---------------------------------------------------------------------------
// Production Tables (制片大表)
// ---------------------------------------------------------------------------

/**
 * Production Tables table
 * Top-level entity representing a collaborative spreadsheet for video production.
 */
export const productionTables = pgTable("production_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Production Table Columns
 * Column definitions (heading row). All cells in a column share the same type.
 */
export const productionTableColumns = pgTable("production_table_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => productionTables.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  cellType: varchar("cell_type", { length: 20 }).notNull().default("text"), // "text" | "media"
  sortOrder: integer("sort_order").notNull().default(0),
  width: integer("width").notNull().default(192),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Production Table Rows
 * Row shells created when user adds a row. Cells within are sparse.
 */
export const productionTableRows = pgTable("production_table_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => productionTables.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  height: integer("height").notNull().default(48),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Production Table Cells
 * Sparse cell storage — only created when a user writes content.
 * One cell per (columnId, rowId) intersection.
 */
export const productionTableCells = pgTable(
  "production_table_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => productionTables.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => productionTableColumns.id, { onDelete: "cascade" }),
    rowId: uuid("row_id")
      .notNull()
      .references(() => productionTableRows.id, { onDelete: "cascade" }),
    textContent: text("text_content"),
    mediaAssets: jsonb("media_assets").$type<
      Array<{
        assetId: string;
        imageId: string;
        assetType: string;
        thumbnailImageId?: string;
      }>
    >(),
    comment: jsonb("comment").$type<{ text: string } | null>(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    uniqueColumnRow: unique().on(table.columnId, table.rowId),
  })
);

/**
 * Production Table Shares
 * Table-level sharing (viewer or collaborator).
 */
export const productionTableShares = pgTable("production_table_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => productionTables.id, { onDelete: "cascade" }),
  sharedWithUserId: uuid("shared_with_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 20 }).notNull(), // 'viewer' | 'collaborator'
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
});

/**
 * Production Table Column Shares
 * Column-level edit grants. Presence of a record = edit access to that column.
 */
export const productionTableColumnShares = pgTable(
  "production_table_column_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => productionTables.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => productionTableColumns.id, { onDelete: "cascade" }),
    sharedWithUserId: uuid("shared_with_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharedAt: timestamp("shared_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueColumnUser: unique().on(table.columnId, table.sharedWithUserId),
  })
);

/**
 * Production Table Row Shares
 * Row-level edit grants. Presence of a record = edit access to that row.
 */
export const productionTableRowShares = pgTable(
  "production_table_row_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => productionTables.id, { onDelete: "cascade" }),
    rowId: uuid("row_id")
      .notNull()
      .references(() => productionTableRows.id, { onDelete: "cascade" }),
    sharedWithUserId: uuid("shared_with_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharedAt: timestamp("shared_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueRowUser: unique().on(table.rowId, table.sharedWithUserId),
  })
);

export type ProductionTable = typeof productionTables.$inferSelect;
export type NewProductionTable = typeof productionTables.$inferInsert;

export type ProductionTableColumn = typeof productionTableColumns.$inferSelect;
export type NewProductionTableColumn = typeof productionTableColumns.$inferInsert;

export type ProductionTableRow = typeof productionTableRows.$inferSelect;
export type NewProductionTableRow = typeof productionTableRows.$inferInsert;

export type ProductionTableCell = typeof productionTableCells.$inferSelect;
export type NewProductionTableCell = typeof productionTableCells.$inferInsert;

export type ProductionTableShare = typeof productionTableShares.$inferSelect;
export type NewProductionTableShare = typeof productionTableShares.$inferInsert;

export type ProductionTableColumnShare = typeof productionTableColumnShares.$inferSelect;
export type NewProductionTableColumnShare = typeof productionTableColumnShares.$inferInsert;

export type ProductionTableRowShare = typeof productionTableRowShares.$inferSelect;
export type NewProductionTableRowShare = typeof productionTableRowShares.$inferInsert;
