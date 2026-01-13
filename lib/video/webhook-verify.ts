/**
 * Fal Webhook Signature Verification
 *
 * Verifies the authenticity of incoming webhook requests from Fal
 * using ED25519 signature verification against their JWKS public keys.
 */

import crypto from "crypto";

const JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
const JWKS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const TIMESTAMP_LEEWAY_SECONDS = 300; // 5 minutes

interface JWKSKey {
  kty: string;
  crv: string;
  x: string;
  kid?: string;
}

interface JWKSCache {
  keys: JWKSKey[];
  cachedAt: number;
}

let jwksCache: JWKSCache | null = null;

/**
 * Fetch and cache JWKS public keys from Fal
 */
async function fetchJWKS(): Promise<JWKSKey[]> {
  const currentTime = Date.now();

  // Return cached keys if still valid
  if (jwksCache && currentTime - jwksCache.cachedAt < JWKS_CACHE_DURATION_MS) {
    return jwksCache.keys;
  }

  try {
    const response = await fetch(JWKS_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`JWKS fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const keys = data.keys || [];

    // Update cache
    jwksCache = {
      keys,
      cachedAt: currentTime,
    };

    return keys;
  } catch (error) {
    console.error("[Webhook Verify] Error fetching JWKS:", error);
    // If we have stale cache, use it as fallback
    if (jwksCache) {
      console.warn("[Webhook Verify] Using stale JWKS cache as fallback");
      return jwksCache.keys;
    }
    throw error;
  }
}

/**
 * Convert base64url to regular base64
 */
function base64urlToBase64(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }
  return base64;
}

/**
 * Verify an ED25519 signature using Node.js crypto
 */
function verifyED25519Signature(
  publicKeyBytes: Buffer,
  message: Buffer,
  signature: Buffer
): boolean {
  try {
    // Create a public key object from the raw bytes
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([
        // ED25519 public key header
        Buffer.from("302a300506032b6570032100", "hex"),
        publicKeyBytes,
      ]),
      format: "der",
      type: "spki",
    });

    return crypto.verify(null, message, publicKey, signature);
  } catch (error) {
    console.error("[Webhook Verify] Signature verification error:", error);
    return false;
  }
}

export interface WebhookHeaders {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Extract webhook verification headers from a request
 */
export function extractWebhookHeaders(headers: Headers): WebhookHeaders {
  return {
    requestId: headers.get("x-fal-webhook-request-id"),
    userId: headers.get("x-fal-webhook-user-id"),
    timestamp: headers.get("x-fal-webhook-timestamp"),
    signature: headers.get("x-fal-webhook-signature"),
  };
}

/**
 * Verify a Fal webhook request
 *
 * @param headers The webhook headers object
 * @param body The raw request body as a Buffer
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyFalWebhook(
  headers: WebhookHeaders,
  body: Buffer
): Promise<boolean> {
  const { requestId, userId, timestamp, signature } = headers;

  // Check all required headers are present
  if (!requestId || !userId || !timestamp || !signature) {
    console.error("[Webhook Verify] Missing required headers");
    return false;
  }

  // Validate timestamp (within ±5 minutes)
  try {
    const timestampInt = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);

    if (Math.abs(currentTime - timestampInt) > TIMESTAMP_LEEWAY_SECONDS) {
      console.error(
        "[Webhook Verify] Timestamp is too old or in the future:",
        { timestampInt, currentTime, diff: currentTime - timestampInt }
      );
      return false;
    }
  } catch (e) {
    console.error("[Webhook Verify] Invalid timestamp format");
    return false;
  }

  // Construct the message to verify
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const messageParts = [requestId, userId, timestamp, bodyHash];
  const messageToVerify = Buffer.from(messageParts.join("\n"), "utf-8");

  // Decode signature from hex
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "hex");
  } catch (e) {
    console.error("[Webhook Verify] Invalid signature format (not hexadecimal)");
    return false;
  }

  // Fetch public keys
  let publicKeys: JWKSKey[];
  try {
    publicKeys = await fetchJWKS();
    if (!publicKeys.length) {
      console.error("[Webhook Verify] No public keys found in JWKS");
      return false;
    }
  } catch (e) {
    console.error("[Webhook Verify] Error fetching JWKS:", e);
    return false;
  }

  // Try to verify with each public key
  for (const keyInfo of publicKeys) {
    try {
      const publicKeyB64Url = keyInfo.x;
      if (typeof publicKeyB64Url !== "string") continue;

      const publicKeyBytes = Buffer.from(
        base64urlToBase64(publicKeyB64Url),
        "base64"
      );

      const isValid = verifyED25519Signature(
        publicKeyBytes,
        messageToVerify,
        signatureBytes
      );

      if (isValid) {
        return true;
      }
    } catch (e) {
      // Continue to next key
      continue;
    }
  }

  console.error("[Webhook Verify] Signature verification failed with all keys");
  return false;
}

/**
 * Skip verification in development mode
 * Only use this for local testing!
 */
export function shouldSkipVerification(): boolean {
  return process.env.NODE_ENV === "development" && 
         process.env.SKIP_WEBHOOK_VERIFICATION === "true";
}
