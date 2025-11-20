/**
 * Database utility for the control plane
 * Provides PostgreSQL connection pooling with proper SSL configuration
 */

import { Pool, PoolConfig, QueryResult, QueryResultRow } from "pg";
import { getConfig } from "./config";

let globalPool: Pool | null = null;

/**
 * Get or create a PostgreSQL connection pool
 * Uses singleton pattern to reuse the same pool across requests
 */
export async function getPool(): Promise<Pool> {
  if (globalPool) {
    return globalPool;
  }

  const config = await getConfig();

  // Process database URL to remove SSL parameters that might conflict
  let processedURL = config.databaseURL;

  // Remove sslmode parameter if present (e.g., sslmode=require)
  if (processedURL.includes("sslmode=")) {
    processedURL = processedURL.replace(/[?&]sslmode=[^&]*/g, "");
  }

  // Clean up any trailing ? or & characters
  processedURL = processedURL.replace(/[?&]$/, "");

  console.log("[Database] Creating connection pool with SSL config");

  const poolConfig: PoolConfig = {
    connectionString: processedURL,
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Fail if connection takes more than 10 seconds
    ssl: {
      rejectUnauthorized: false, // Accept self-signed certificates (for AWS RDS, etc.)
    },
  };

  globalPool = new Pool(poolConfig);

  // Log pool events for monitoring
  globalPool.on("connect", () => {
    console.log("[Database] New client connected to pool");
  });

  globalPool.on("error", (err) => {
    console.error("[Database] Unexpected pool error:", err);
  });

  console.log("[Database] Connection pool created successfully");

  return globalPool;
}

/**
 * Execute a query using the connection pool
 * Convenience function for common queries
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = await getPool();
  return pool.query<T>(text, params);
}

/**
 * Close the connection pool
 * Should be called when shutting down the application
 */
export async function closePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
    console.log("[Database] Connection pool closed");
  }
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query("SELECT NOW() as current_time");
    console.log(
      "[Database] Connection test successful:",
      result.rows[0].current_time
    );
    return true;
  } catch (error) {
    console.error("[Database] Connection test failed:", error);
    return false;
  }
}
