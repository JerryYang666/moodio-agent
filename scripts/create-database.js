#!/usr/bin/env node

/**
 * Script to create the database if it doesn't exist
 * Run with: node scripts/create-database.js
 */

require("dotenv").config();
const { Client } = require("pg");

async function createDatabase() {
  // Parse the DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    console.error("Please create a .env file with your DATABASE_URL");
    process.exit(1);
  }

  // Auto-encode password with special characters
  // Match: protocol://user:password@host:port/db
  // Find the last @ that precedes a hostname (contains dots and no special chars)
  const protocolMatch = dbUrl.match(/^(postgresql?:\/\/)/);
  if (!protocolMatch) {
    console.error("❌ DATABASE_URL must start with postgresql:// or postgres://");
    process.exit(1);
  }

  const protocol = protocolMatch[1];
  const rest = dbUrl.slice(protocol.length);

  // Find user (everything before first :)
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    console.error("❌ DATABASE_URL missing password separator (:)");
    process.exit(1);
  }
  const user = rest.slice(0, colonIndex);
  const afterUser = rest.slice(colonIndex + 1);

  // Find the @ that separates password from host
  // Look for @<hostname> pattern (hostname has dots and alphanumeric chars)
  const hostMatch = afterUser.match(/@([a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+[:\/?])/);
  if (!hostMatch) {
    console.error("❌ Could not find host in DATABASE_URL");
    process.exit(1);
  }

  const atHostIndex = afterUser.indexOf(hostMatch[0]);
  const password = afterUser.slice(0, atHostIndex);
  const hostAndRest = afterUser.slice(atHostIndex + 1); // skip the @

  // Rebuild URL with encoded password
  const encodedPassword = encodeURIComponent(password);
  const fixedUrl = `${protocol}${user}:${encodedPassword}@${hostAndRest}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(fixedUrl);
  } catch (e) {
    console.error("❌ Could not parse DATABASE_URL:", e.message);
    process.exit(1);
  }

  // Extract database name from pathname
  const dbName = parsedUrl.pathname.slice(1) || "moodio-dev";

  // Create connection to postgres database (default)
  parsedUrl.pathname = "/postgres";
  const postgresUrl = parsedUrl.toString();

  const client = new Client({
    connectionString: postgresUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log("🔌 Connecting to PostgreSQL...");
    await client.connect();

    console.log(`📝 Checking if database "${dbName}" exists...`);

    // Check if database exists
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length > 0) {
      console.log(`✅ Database "${dbName}" already exists!`);
    } else {
      console.log(`📦 Creating database "${dbName}"...`);
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`✅ Database "${dbName}" created successfully!`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();
