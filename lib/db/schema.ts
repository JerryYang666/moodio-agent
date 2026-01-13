import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  jsonb,
  bigint,
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
 * Stores images within projects, optionally within a collection, along with their generation details
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
  imageId: varchar("image_id", { length: 255 }).notNull(), // S3 image ID
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
