# Authentication System Documentation

This document provides a comprehensive overview of the Moodio authentication system, covering the OTP-based login flow, JWT access tokens, refresh token rotation, automatic session renewal, and the underlying database schema.

---

## Table of Contents

1. [Database Schema](#database-schema)
2. [Login Flow (OTP-Based)](#login-flow-otp-based)
3. [Token Architecture](#token-architecture)
4. [Automatic Token Refresh](#automatic-token-refresh)
5. [Logout](#logout)
6. [Configuration Reference](#configuration-reference)
7. [Security Considerations](#security-considerations)
8. [File Reference](#file-reference)

---

## Database Schema

The authentication system relies on three core database tables defined in `lib/db/schema.ts` using Drizzle ORM with PostgreSQL.

### 1. `users` Table

Stores user account information. A new user record is created automatically the first time someone requests an OTP with a previously-unseen email address.

| Column                  | Type                  | Constraints                 | Description                                                    |
|-------------------------|-----------------------|-----------------------------|----------------------------------------------------------------|
| `id`                    | `uuid`                | PK, auto-generated          | Unique user identifier                                         |
| `email`                 | `varchar(255)`        | NOT NULL, UNIQUE            | User's email address (stored lowercase)                        |
| `first_name`            | `varchar(100)`        | nullable                    | User's first name (set during onboarding)                      |
| `last_name`             | `varchar(100)`        | nullable                    | User's last name (set during onboarding)                       |
| `auth_provider`         | `varchar(50)`         | NOT NULL, default `"email"` | Authentication provider (`"email"`, `"cwru_sso"`, etc.)        |
| `auth_provider_metadata`| `jsonb`               | nullable                    | Provider-specific metadata (e.g., studentId for CWRU SSO)      |
| `roles`                 | `jsonb` (string[])    | NOT NULL, default `["new_user"]` | Array of role names. Starts as `["new_user"]`, becomes `["user"]` after onboarding |
| `testing_groups`        | `jsonb` (string[])    | NOT NULL, default `[]`      | Array of testing group UUIDs for A/B testing                   |
| `created_at`            | `timestamp`           | NOT NULL, default now       | Account creation timestamp                                     |
| `updated_at`            | `timestamp`           | NOT NULL, default now       | Last update timestamp                                          |

**Key behaviors:**
- New users are created with `roles: ["new_user"]` during the OTP request step.
- After completing onboarding (`POST /api/auth/onboarding`), the role changes to `["user"]`.
- The `email` column has a unique constraint, preventing duplicate accounts.
- Cascade delete: deleting a user removes all associated OTPs, refresh tokens, and other related records.

### 2. `otps` Table

Stores one-time passwords used for email-based authentication.

| Column       | Type           | Constraints                          | Description                                     |
|--------------|----------------|--------------------------------------|-------------------------------------------------|
| `id`         | `uuid`         | PK, auto-generated                   | Unique OTP record identifier                    |
| `user_id`    | `uuid`         | NOT NULL, FK → `users.id` (CASCADE)  | The user this OTP belongs to                    |
| `code`       | `varchar(10)`  | NOT NULL                             | The 6-digit numeric OTP code                    |
| `expires_at` | `timestamp`    | NOT NULL                             | When the OTP expires (10 minutes after creation) |
| `is_used`    | `boolean`      | NOT NULL, default `false`            | Whether the OTP has been consumed                |
| `created_at` | `timestamp`    | NOT NULL, default now                | When the OTP was generated                       |

**Key behaviors:**
- Each OTP is single-use: once verified, `is_used` is set to `true`.
- OTPs expire after **10 minutes** (`config: siteConfig.auth.otp.expiresInMinutes`).
- Verification checks three conditions: correct `user_id` + `code`, `is_used = false`, and `expires_at > now()`.
- Multiple OTPs can exist for a user simultaneously (e.g., if they request a new one before the old one expires). Only the one matching the submitted code is consumed.
- Used OTPs are cleaned up via `cleanupOTPs()`.

### 3. `refresh_tokens` Table

Stores active refresh tokens that allow the system to issue new access tokens without requiring re-authentication.

| Column              | Type        | Constraints                          | Description                                                    |
|---------------------|-------------|--------------------------------------|----------------------------------------------------------------|
| `id`                | `uuid`      | PK, auto-generated                   | Unique token record identifier                                 |
| `user_id`           | `uuid`      | NOT NULL, FK → `users.id` (CASCADE)  | The user this token belongs to                                 |
| `token`             | `text`      | NOT NULL, UNIQUE                     | The refresh token value (64-char hex string: two UUIDs concatenated without dashes) |
| `expires_at`        | `timestamp` | NOT NULL                             | When this specific token expires                               |
| `session_expires_at`| `timestamp` | NOT NULL, default now                | The absolute session expiration (preserved across rotations)   |
| `created_at`        | `timestamp` | NOT NULL, default now                | When the token was created                                     |

**Key behaviors:**
- Tokens are **single-use with a grace period**: when a token is used to refresh, it is not deleted but instead has its `expires_at` shortened to `now + 1 hour` (grace period), allowing concurrent in-flight requests to complete.
- `session_expires_at` is set once at initial login (20 days from login) and is **inherited** by every subsequent rotated token. This ensures that no matter how many times the token is refreshed, the session will absolutely expire after the original 20-day window.
- The `token` column has a unique constraint, enabling fast lookups.
- A user can have multiple active refresh tokens (e.g., logged in on multiple devices).

### Entity Relationship Diagram

```
┌──────────────────┐
│      users       │
├──────────────────┤
│ id (PK)          │◄──────────────────────────────────────┐
│ email (UNIQUE)   │                                       │
│ first_name       │      ┌──────────────────┐             │
│ last_name        │      │       otps       │             │
│ auth_provider    │      ├──────────────────┤             │
│ roles            │      │ id (PK)          │             │
│ ...              │      │ user_id (FK) ────┼─────────────┤
│                  │      │ code             │             │
│                  │      │ expires_at       │             │
│                  │      │ is_used          │             │
│                  │      │ created_at       │             │
│                  │      └──────────────────┘             │
│                  │                                       │
│                  │      ┌──────────────────────┐         │
│                  │      │   refresh_tokens     │         │
│                  │      ├──────────────────────┤         │
│                  │      │ id (PK)              │         │
│                  │      │ user_id (FK) ────────┼─────────┘
│                  │      │ token (UNIQUE)       │
│                  │      │ expires_at           │
│                  │      │ session_expires_at   │
│                  │      │ created_at           │
└──────────────────┘      └──────────────────────┘
```

All foreign keys use `ON DELETE CASCADE` — deleting a user automatically removes all their OTPs and refresh tokens.

---

## Login Flow (OTP-Based)

Moodio uses a **passwordless, email-based OTP login**. There are no passwords stored anywhere in the system. The full flow has two steps:

### Step 1: Request OTP — `POST /api/auth/request-otp`

**Source:** `app/api/auth/request-otp/route.ts`

```
Client                          Server                          Database
  │                               │                               │
  │  POST /api/auth/request-otp   │                               │
  │  { email: "user@example.com"} │                               │
  │──────────────────────────────►│                               │
  │                               │  SELECT * FROM users           │
  │                               │  WHERE email = ?               │
  │                               │──────────────────────────────►│
  │                               │◄──────────────────────────────│
  │                               │                               │
  │                               │  (If no user found)            │
  │                               │  INSERT INTO users (email,     │
  │                               │    roles: ["new_user"])        │
  │                               │──────────────────────────────►│
  │                               │◄──────────────────────────────│
  │                               │                               │
  │                               │  Generate 6-digit OTP          │
  │                               │  INSERT INTO otps (user_id,    │
  │                               │    code, expires_at)           │
  │                               │──────────────────────────────►│
  │                               │                               │
  │                               │  Send OTP email (async)        │
  │                               │──────────────────────►📧      │
  │                               │                               │
  │  { success: true,             │                               │
  │    message: "OTP sent" }      │                               │
  │◄──────────────────────────────│                               │
```

**Behavior details:**
1. The email is normalized to lowercase.
2. If the email is not found in the `users` table, a new user is created with `roles: ["new_user"]`.
3. A 6-digit numeric OTP is generated using `Math.random()` (range: 100000–999999).
4. The OTP is stored in the database with an expiration of **10 minutes**.
5. The OTP email is sent asynchronously using `waitUntil()` from `@vercel/functions` so the API response is not delayed by email delivery.

### Step 2: Verify OTP — `POST /api/auth/verify-otp`

**Source:** `app/api/auth/verify-otp/route.ts`

```
Client                          Server                          Database
  │                               │                               │
  │  POST /api/auth/verify-otp    │                               │
  │  { email, code: "123456" }    │                               │
  │──────────────────────────────►│                               │
  │                               │  Find user by email            │
  │                               │──────────────────────────────►│
  │                               │◄──────────────────────────────│
  │                               │                               │
  │                               │  Verify OTP:                   │
  │                               │  SELECT FROM otps WHERE        │
  │                               │    user_id = ? AND code = ?    │
  │                               │    AND is_used = false         │
  │                               │    AND expires_at > now()      │
  │                               │──────────────────────────────►│
  │                               │◄──────────────────────────────│
  │                               │                               │
  │                               │  Mark OTP as used              │
  │                               │  UPDATE otps SET is_used=true  │
  │                               │──────────────────────────────►│
  │                               │                               │
  │                               │  Generate JWT access token     │
  │                               │  (HS256, 30min expiry)         │
  │                               │                               │
  │                               │  Generate refresh token        │
  │                               │  (two UUIDs, 64 chars)         │
  │                               │                               │
  │                               │  INSERT INTO refresh_tokens    │
  │                               │  (user_id, token, expires_at,  │
  │                               │   session_expires_at)          │
  │                               │──────────────────────────────►│
  │                               │                               │
  │  Set-Cookie: moodio_access_token=<JWT>; HttpOnly; Secure      │
  │  Set-Cookie: moodio_refresh_token=<token>; HttpOnly; Secure   │
  │  Set-Cookie: CloudFront-Policy=...; CloudFront-Signature=...  │
  │  { success: true, user: {...} }                               │
  │◄──────────────────────────────│                               │
```

**Behavior details:**
1. Looks up the user by email (lowercase).
2. Calls `verifyOTP(userId, code)` which checks the OTP is valid, unused, and not expired.
3. On success, marks the OTP as used (`is_used = true`).
4. Generates a **JWT access token** containing `userId`, `email`, `roles`, `firstName`, and `lastName`.
5. Generates a **refresh token** (two UUIDs concatenated without dashes, 64 characters).
6. Stores the refresh token in the database with `expires_at` and `session_expires_at` both set to **20 days** from now.
7. Sets three types of HTTP-only cookies: access token, refresh token, and CloudFront signed cookies (for CDN-protected asset access).
8. Returns the user object in the response body.

---

## Token Architecture

### Access Token (JWT)

**Source:** `lib/auth/jwt.ts`

| Property      | Value                                                          |
|---------------|----------------------------------------------------------------|
| Format        | JSON Web Token (JWT)                                           |
| Algorithm     | HS256 (HMAC-SHA256)                                            |
| Secret        | `JWT_ACCESS_SECRET` environment variable                       |
| Expiration    | **30 minutes**                                                 |
| Clock tolerance | 60 seconds (allows for minor server time differences)        |
| Cookie name   | `moodio_access_token`                                          |
| Library       | `jose` (`SignJWT` / `jwtVerify`)                               |

**JWT Payload:**

```typescript
interface AccessTokenPayload {
  userId: string;       // User's UUID
  email?: string;       // User's email
  roles?: string[];     // e.g., ["new_user"] or ["user"]
  firstName?: string;   // User's first name
  lastName?: string;    // User's last name
}
```

The access token is **stateless** — the server verifies it purely by checking the HMAC signature and expiration. No database lookup is required.

### Refresh Token (UUID-Based)

**Source:** `lib/auth/tokens.ts`

| Property      | Value                                                          |
|---------------|----------------------------------------------------------------|
| Format        | Two UUIDs concatenated without dashes (64 hex characters)      |
| Storage       | Database (`refresh_tokens` table)                              |
| Expiration    | **20 days** (session lifetime)                                 |
| Grace period  | **1 hour** (after rotation, old token stays valid briefly)     |
| Cookie name   | `moodio_refresh_token`                                         |

**Generation:**

```typescript
function generateRefreshToken(): string {
  const uuid1 = uuidv4().replace(/-/g, "");
  const uuid2 = uuidv4().replace(/-/g, "");
  return `${uuid1}${uuid2}`; // 64-character hex string
}
```

The refresh token is **stateful** — it must be looked up in the database and verified against `expires_at` before it can be used.

### Cookie Configuration

Both tokens are stored as HTTP-only cookies with the following settings (from `config/site.ts`):

| Setting    | Value                                  |
|------------|----------------------------------------|
| `httpOnly` | `true` (not accessible via JavaScript) |
| `secure`   | `true` in production                   |
| `sameSite` | `lax`                                  |
| `path`     | `/`                                    |

---

## Automatic Token Refresh

The system implements automatic token refresh at **three layers**, ensuring seamless session continuity.

### Layer 1: Server-Side Middleware (Primary)

**Source:** `middleware.ts`

The Next.js middleware intercepts every request and handles token refresh transparently before the request reaches any route handler.

```
Browser Request
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                    MIDDLEWARE                              │
│                                                           │
│  1. Is this a maintenance mode redirect?                  │
│     └─ Yes → Redirect to /maintenance                    │
│                                                           │
│  2. Verify access token from cookie                       │
│     └─ Valid → Continue to route handler                  │
│                                                           │
│  3. Is this the login page? (/auth/login)                 │
│     ├─ Valid token → Redirect to /                        │
│     └─ No valid token → Try refresh                       │
│        ├─ Refresh succeeds → Redirect to / with new cookies│
│        └─ Refresh fails → Show login page                 │
│                                                           │
│  4. Is this a public path?                                │
│     └─ Yes → Allow through                                │
│        (Special: /api/auth/me attempts refresh if needed)│
│                                                           │
│  5. Protected path, no valid access token                 │
│     ├─ Is this a prefetch? → Return 204 (skip refresh)    │
│     └─ Attempt token refresh                              │
│        ├─ Refresh succeeds →                              │
│        │   Update request cookies with new access token   │
│        │   Attach Set-Cookie headers to response          │
│        │   Continue to route handler                      │
│        └─ Refresh fails →                                 │
│           ├─ API route → Return 401 JSON                  │
│           └─ Page route → Redirect to /auth/login         │
│              (with ?redirect= to return after login)      │
│           Clear all auth & CloudFront cookies             │
└──────────────────────────────────────────────────────────┘
```

**How the middleware refreshes:**
1. Calls `POST /api/auth/refresh` internally, forwarding the refresh token cookie.
2. Extracts the new access token from the `Set-Cookie` response header.
3. Updates the request cookies (so downstream handlers see the fresh token).
4. Appends all `Set-Cookie` headers to the outgoing response (so the browser gets the new cookies).

**Prefetch handling:** The middleware detects browser/Next.js prefetch requests (via `Purpose`, `Sec-Purpose`, `X-Purpose`, `X-Moz`, and `X-Middleware-Prefetch` headers) and **skips token refresh** on prefetches to avoid unnecessary token rotation.

**Public paths** that bypass authentication:
- `/auth/*` (all auth pages)
- `/api/auth/request-otp`
- `/api/auth/verify-otp`
- `/api/auth/refresh`
- `/api/auth/me` (with special refresh logic)
- `/api/auth/passkey/login/*`
- `/api/video/webhook`

### Layer 2: Client-Side API Interceptor (RTK Query)

**Source:** `lib/redux/services/base-query.ts`

For client-side API calls made via Redux Toolkit Query, a custom base query wrapper handles 401 errors:

```
Client API Call (e.g., fetch user data)
       │
       ▼
┌─────────────────────────────────────────┐
│   RTK Query Base Query with Reauth      │
│                                          │
│  1. Execute original API request         │
│     └─ Success → Return result           │
│                                          │
│  2. Got 401 Unauthorized?                │
│     └─ Yes → POST /api/auth/refresh      │
│        ├─ Refresh OK → Retry original    │
│        │   request (now with new cookie) │
│        └─ Refresh failed →               │
│           Redirect to /auth/login        │
└─────────────────────────────────────────┘
```

This acts as a safety net: if the middleware's refresh didn't fire (e.g., on a long-lived SPA page), the client-side interceptor catches the 401 and retries.

### Layer 3: Refresh API Endpoint

**Source:** `app/api/auth/refresh/route.ts`

`POST /api/auth/refresh` is the core endpoint used by both the middleware and the client-side interceptor. It delegates to the shared `refreshAccessToken()` function.

### Refresh Token Rotation (Detailed)

When a refresh is triggered, the following happens inside `refreshAccessToken()` in `lib/auth/tokens.ts`:

```
                    refreshAccessToken(oldRefreshToken)
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │  1. Find token in DB                  │
              │     WHERE token = ? AND               │
              │     expires_at > now()                │
              │                                       │
              │  2. Fetch user from DB                │
              │     (to get current email, roles, etc.)│
              │                                       │
              │  3. Capture session_expires_at         │
              │     from old token record              │
              │                                       │
              │  4. Invalidate old token:              │
              │     SET expires_at = now() + 1 hour    │
              │     (grace period for in-flight reqs)  │
              │                                       │
              │  5. Generate new access token (JWT)    │
              │     30 min expiry, with latest user    │
              │     data from DB                       │
              │                                       │
              │  6. Generate new refresh token         │
              │     (64 char hex string)               │
              │                                       │
              │  7. Store new refresh token:            │
              │     expires_at = session_expires_at     │
              │     session_expires_at = (inherited)    │
              │     (NOT reset to 20 days from now)    │
              │                                       │
              │  8. Return both new tokens              │
              └──────────────────────────────────────┘
```

**Why the grace period?**
When a user has multiple concurrent requests in flight (e.g., the browser fires 3 API calls at once), the first request to hit the refresh endpoint will rotate the token. The other two requests still carry the old refresh token. The 1-hour grace period ensures these concurrent requests can still complete without failing with 401 errors.

**Why inherit `session_expires_at`?**
Without this, a user could stay logged in indefinitely by continuously refreshing. By inheriting the original `session_expires_at` (set once at login), the session has a hard upper bound of **20 days** regardless of activity. After 20 days, the user must log in again.

---

## Logout

**Source:** `app/api/auth/logout/route.ts`

```
Client                          Server                          Database
  │                               │                               │
  │  POST /api/auth/logout        │                               │
  │──────────────────────────────►│                               │
  │                               │  Read refresh token from       │
  │                               │  cookie                        │
  │                               │                               │
  │                               │  DELETE FROM refresh_tokens    │
  │                               │  WHERE token = ?               │
  │                               │──────────────────────────────►│
  │                               │                               │
  │  Set-Cookie: moodio_access_token=; Max-Age=0                  │
  │  Set-Cookie: moodio_refresh_token=; Max-Age=0                 │
  │  Set-Cookie: CloudFront-*=; Max-Age=0                         │
  │  { success: true }            │                               │
  │◄──────────────────────────────│                               │
```

1. Reads the refresh token from the cookie.
2. Deletes the refresh token record from the database (immediate revocation).
3. Clears all authentication cookies (access token, refresh token, CloudFront signed cookies).

---

## Configuration Reference

All authentication-related configuration lives in `config/site.ts` under `siteConfig.auth`:

```typescript
auth: {
  accessToken: {
    expiresIn: "30m",                    // JWT expiry (jose format)
    cookieName: "moodio_access_token",   // Cookie name
    maxAge: 30 * 60,                     // Cookie max-age (1800 seconds)
  },

  clockSkewSeconds: 60,                  // JWT verification tolerance

  refreshToken: {
    expiresInDays: 20,                   // Session duration
    gracePeriodSeconds: 3600,            // Old token grace period (1 hour)
    cookieName: "moodio_refresh_token",  // Cookie name
    maxAge: 20 * 24 * 60 * 60,          // Cookie max-age (1,728,000 seconds)
  },

  otp: {
    length: 6,                           // OTP digit count
    expiresInMinutes: 10,                // OTP validity window
  },

  cookie: {
    httpOnly: true,                      // Not accessible via JS
    secure: true,                        // HTTPS only (in production)
    sameSite: "lax",                     // CSRF protection
    path: "/",                           // Available on all routes
  },
}
```

---

## Security Considerations

| Concern                      | Mitigation                                                                         |
|------------------------------|------------------------------------------------------------------------------------|
| XSS / Token theft            | All tokens stored in `httpOnly` cookies — inaccessible to JavaScript               |
| CSRF                         | `sameSite: "lax"` prevents cross-origin cookie sending on unsafe methods           |
| Token replay                 | Refresh tokens are single-use with rotation; old tokens expire after 1-hour grace  |
| Session hijacking            | `secure: true` in production ensures cookies only sent over HTTPS                  |
| Indefinite sessions          | `session_expires_at` enforces a hard 20-day upper bound                            |
| Concurrent request conflicts | 1-hour grace period on rotated tokens prevents race conditions                     |
| Clock skew                   | 60-second tolerance on JWT verification handles minor server time differences      |
| Brute-force OTP              | OTPs expire after 10 minutes and are single-use                                    |
| User deletion                | `ON DELETE CASCADE` on all foreign keys ensures complete cleanup                   |

---

## File Reference

| File                                           | Purpose                                                  |
|------------------------------------------------|----------------------------------------------------------|
| `lib/db/schema.ts`                             | Database schema (users, otps, refresh_tokens tables)     |
| `lib/auth/otp.ts`                              | OTP generation, storage, verification, and cleanup       |
| `lib/auth/jwt.ts`                              | JWT access token generation and verification             |
| `lib/auth/tokens.ts`                           | Refresh token generation, storage, rotation, and cleanup |
| `lib/auth/cookies.ts`                          | Cookie get/set/clear utilities for auth tokens           |
| `lib/auth/cloudfront-cookies.ts`               | CloudFront signed cookie generation                      |
| `lib/auth/cloudfront-cookie-config.ts`         | CloudFront cookie configuration and clearing             |
| `config/site.ts`                               | All auth configuration values                            |
| `middleware.ts`                                 | Route protection and automatic server-side token refresh  |
| `app/api/auth/request-otp/route.ts`            | OTP request endpoint                                     |
| `app/api/auth/verify-otp/route.ts`             | OTP verification and token issuance endpoint             |
| `app/api/auth/refresh/route.ts`                | Token refresh endpoint                                   |
| `app/api/auth/logout/route.ts`                 | Logout endpoint                                          |
| `app/api/auth/me/route.ts`                     | Current user info endpoint                               |
| `app/api/auth/onboarding/route.ts`             | User onboarding (name, role upgrade)                     |
| `lib/redux/services/base-query.ts`             | Client-side RTK Query 401 interceptor with auto-refresh  |
