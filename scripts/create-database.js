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

  // Extract database name from URL
  const urlMatch = dbUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = urlMatch ? urlMatch[1] : "moodio-dev";

  // Create connection to postgres database (default)
  const postgresUrl = dbUrl.replace(`/${dbName}`, "/postgres");

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
