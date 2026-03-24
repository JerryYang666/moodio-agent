# Credit Operations Audit

> Last audited: 2026-03-24

## Architecture Overview

The credit system supports two account types:

| Account Type | Balance Table | ID Column | FK Constraint |
|---|---|---|---|
| `personal` | `user_credits` | `user_id → users.id` | Yes — FK to `users` |
| `team` | `team_credits` | `team_id → teams.id` | Yes — FK to `teams` |

The `credit_transactions` table is polymorphic — `accountId` can point to either a user or a team, discriminated by `accountType`. It has **no** FK constraint on `accountId`.

### Core Functions (`lib/credits.ts`)

| Function | Purpose | Auto-creates row? |
|---|---|---|
| `getActiveAccount(userId, payload)` | Resolves billing account (personal or team) from JWT and `user_active_accounts` table | No |
| `getUserBalance(accountId, accountType, tx?)` | Reads balance; auto-creates if missing | **Yes** — personal only (inserts into `user_credits`) |
| `assertSufficientCredits(accountId, amount, accountType, tx?)` | Calls `getUserBalance` internally, throws `InsufficientCreditsError` | Yes (via `getUserBalance`) |
| `deductCredits(accountId, amount, type, desc?, performedBy?, relatedEntity?, accountType, tx?)` | Atomically deducts balance + records negative transaction | No (will throw if row missing and balance is 0) |
| `grantCredits(accountId, amount, type, desc?, performedBy?, relatedEntity?, accountType, tx?)` | Upserts balance row + records positive transaction | **Yes** — both personal and team |
| `refundCharge(relatedEntity, reason, tx?)` | Looks up original charge, grants credits back | Via `grantCredits` |

### The `accountType` Default Trap

All credit functions default `accountType` to `"personal"` when the parameter is omitted. This means:

- If you pass a **team ID** as `accountId` but forget `accountType`, the function queries `user_credits` instead of `team_credits`.
- If no row is found and the function auto-creates, it tries to insert the team ID into `user_credits.user_id`, which violates the FK constraint to `users.id`.
- **This is the root cause of the bug fixed in this audit.**

---

## Call Site Audit

### 1. Direct Image Generation — `app/api/chat/[chatId]/message/route.ts`

#### Balance check (line ~567)

```typescript
const balance = await getUserBalance(account.accountId, account.accountType);
```

**Status: FIXED** — Previously called `getUserBalance(account.accountId)` without `accountType`, causing FK violations for team accounts. Fixed in this audit.

#### Credit deduction (line ~653)

```typescript
await deductCredits(
  account.accountId, cost, "image_generation", ...,
  account.performedBy, undefined, account.accountType
);
```

**Status: OK** — `accountType` is explicitly passed.

#### Direct video generation balance check (line ~857)

```typescript
await assertSufficientCredits(account.accountId, cost, account.accountType);
```

**Status: OK** — `accountType` is explicitly passed.

#### Direct video generation deduction (line ~907)

```typescript
await deductCredits(
  account.accountId, cost, "video_generation", ...,
  account.performedBy,
  { type: "video_generation", id: generation.id },
  account.accountType, tx
);
```

**Status: OK** — `accountType` is explicitly passed.

#### Agent invocation (line ~1034)

```typescript
account.accountId, account.accountType, account.performedBy
```

**Status: OK** — All three account fields passed to agent `processRequest()`.

---

### 2. Agent 0 — `lib/agents/agent-0.ts`

#### Account resolution (line ~47–49)

```typescript
const effectiveAccountId = accountId || userId;
const effectiveAccountType: AccountType = accountType || "personal";
const effectivePerformedBy = performedBy || userId;
```

**Status: OK** — Falls back to personal if not provided (matches the case when called without account info).

#### Balance check (line ~313)

```typescript
const balance = await getUserBalance(effectiveAccountId, effectiveAccountType);
```

**Status: OK** — Both parameters passed.

#### Credit deduction (line ~375)

```typescript
await deductCredits(
  effectiveAccountId, cost, "image_generation", ...,
  effectivePerformedBy, undefined, effectiveAccountType
);
```

**Status: OK** — All parameters passed.

---

### 3. Agent 1 — `lib/agents/agent-1.ts`

#### Account resolution (line ~142–144)

```typescript
const effectiveAccountId = accountId || userId;
const effectiveAccountType: AccountType = accountType || "personal";
const effectivePerformedBy = performedBy || userId;
```

**Status: OK** — Same safe fallback pattern as Agent 0.

#### `generateImageCore()` balance check (line ~1191–1193)

```typescript
const acctId = effectiveAccountId || userId;
const acctType: AccountType = effectiveAccountType || "personal";
const balance = await getUserBalance(acctId, acctType);
```

**Status: OK** — Both parameters passed with additional fallback.

#### `generateImageCore()` deduction (line ~1228–1239)

```typescript
const acctId = effectiveAccountId || userId;
const acctType: AccountType = effectiveAccountType || "personal";
await deductCredits(acctId, cost, ..., performer, undefined, acctType);
```

**Status: OK** — All parameters passed.

#### `processRequestParallel()` (line ~1306–1308)

```typescript
const effectiveAccountId = accountId || userId;
const effectiveAccountType: AccountType = accountType || "personal";
const effectivePerformedBy = performedBy || userId;
```

**Status: OK** — Passed through to `callLLMAndParseCore` which passes to `generateImage`.

---

### 4. Agent 2 — `lib/agents/agent-2/`

#### Context creation (`context.ts`, line ~126–128)

```typescript
effectiveAccountId: input.accountId || input.userId,
effectiveAccountType: input.accountType || "personal",
effectivePerformedBy: input.performedBy || input.userId,
```

**Status: OK** — Safe fallback pattern, context propagated to all handlers.

#### Image generation handler (`executor/handlers/image-generate.ts`)

Balance check (line ~219):
```typescript
await assertSufficientCredits(ctx.effectiveAccountId, cost, ctx.effectiveAccountType);
```

Credit deduction (line ~253–261):
```typescript
await deductCredits(
  ctx.effectiveAccountId, cost, ...,
  ctx.effectivePerformedBy, undefined, ctx.effectiveAccountType
);
```

**Status: OK** — Uses context fields which always carry the correct `accountType`.

---

### 5. Video Generation API — `app/api/video/generate/route.ts`

#### Account resolution (line ~43)

```typescript
const account = await getActiveAccount(payload.userId, payload);
```

#### Balance check (line ~136)

```typescript
await assertSufficientCredits(account.accountId, cost, account.accountType);
```

#### Credit deduction (line ~188–197)

```typescript
await deductCredits(
  account.accountId, cost, "video_generation", ...,
  account.performedBy,
  { type: "video_generation", id: generation.id },
  account.accountType, tx
);
```

**Status: OK** — All three call sites pass `accountType`.

---

### 6. Video Webhook Handler — `lib/video/webhook-handler.ts`

#### Refund on failure (line ~165)

```typescript
const amount = await refundCharge(
  { type: "video_generation", id: generationId },
  `Refund: ${reason}`, tx
);
```

**Status: OK** — `refundCharge` looks up the original `credit_transactions` record to get the `accountId` and `accountType` from the original charge. No manual passing needed.

---

### 7. Balance API — `app/api/users/credits/balance/route.ts`

#### Team path (line ~23–34)

```typescript
if (account.accountType === "team") {
  const [record] = await db.select().from(teamCredits)
    .where(eq(teamCredits.teamId, account.accountId));
  return NextResponse.json({ balance: record?.balance ?? 0, ... });
}
```

#### Personal path (line ~38–50)

```typescript
let credits = await db.select().from(userCredits)
  .where(eq(userCredits.userId, payload.userId));
if (credits.length === 0) {
  const [newCredit] = await db.insert(userCredits)
    .values({ userId: payload.userId, balance: 0 }).returning();
}
```

**Status: OK** — Explicitly branches on `accountType` before querying. Personal path uses `payload.userId` (never a team ID). Team path uses `teamCredits` table.

---

### 8. Credits History API — `app/api/users/credits/route.ts`

#### Balance fetch (line ~61–83)

```typescript
if (accountType === "team") {
  // queries teamCredits
} else {
  // queries userCredits, auto-creates with payload.userId
}
```

**Status: OK** — Explicitly branched. The `accountId` for personal is always `payload.userId` (line 56). Team `accountId` is validated against JWT memberships (line 48–54).

---

### 9. Daily Check-in — `app/api/users/credits/daily-checkin/route.ts`

#### Grant credits (line ~104)

```typescript
await grantCredits(payload.userId, DAILY_CHECKIN_AMOUNT, "daily_checkin", ...);
```

#### Get balance (line ~111)

```typescript
const balance = await getUserBalance(payload.userId);
```

**Status: OK** — Daily check-in is by design always personal. Uses `payload.userId` directly (a real user ID). The missing `accountType` defaults to `"personal"`, which is correct here.

---

### 10. Onboarding Signup Bonus — `app/api/auth/onboarding/route.ts`

```typescript
await grantCredits(updatedUser.id, SIGNUP_BONUS_CREDITS, "signup_bonus", "New user signup bonus");
```

**Status: OK** — Signup bonus is always personal. Uses a real `users.id`. Missing `accountType` defaults to `"personal"`, which is correct.

---

### 11. Admin Credit Adjustment — `app/api/admin/credits/route.ts`

```typescript
if (targetAccountType === "team") {
  targetAccountId = teamId;
} else {
  targetAccountId = userId;
}

await grantCredits(targetAccountId, ..., targetAccountType);
await deductCredits(targetAccountId, ..., targetAccountType);
```

**Status: OK** — `targetAccountType` is explicitly resolved from the request body and passed to all credit functions. Balance read afterwards branches on `accountType`.

---

### 12. Admin Team Credit Adjustment — `app/api/admin/team-credits/route.ts`

```typescript
await grantCredits(teamId, ..., "team");
await deductCredits(teamId, ..., "team");
```

**Status: OK** — Hardcoded `"team"` accountType.

---

### 13. Admin Credit Transactions — `app/api/admin/credit-transactions/route.ts`

**Status: OK** — Read-only. Queries `credit_transactions` and resolves team names + performer info. No writes.

---

### 14. Admin Users List — `app/api/admin/users/route.ts`

**Status: OK** — Read-only. Joins `users` with `user_credits` for display. No writes.

---

### 15. Admin Teams List — `app/api/admin/teams/route.ts`

**Status: OK** — Read-only. Joins `teams` with `team_credits` for display. No writes.

---

### 16. Team Management — `lib/teams.ts`

#### `createTeam()` (line ~131)

```typescript
await tx.insert(teamCredits).values({ teamId: team.id, balance: 0 });
```

**Status: OK** — Direct insert into `team_credits` with a valid `teams.id`.

#### `getTeamWithMembers()` (line ~102)

```typescript
const [credits] = await tx.select().from(teamCredits)
  .where(eq(teamCredits.teamId, teamId));
```

**Status: OK** — Read-only from correct table.

---

## Summary

| # | Location | Operation | Status | Notes |
|---|---|---|---|---|
| 1a | `message/route.ts` — direct image balance | `getUserBalance` | **FIXED** | Was missing `accountType`, caused FK violation for team users |
| 1b | `message/route.ts` — direct image deduction | `deductCredits` | OK | |
| 1c | `message/route.ts` — direct video balance | `assertSufficientCredits` | OK | |
| 1d | `message/route.ts` — direct video deduction | `deductCredits` | OK | |
| 1e | `message/route.ts` — agent invocation | Pass-through | OK | |
| 2a | `agent-0.ts` — balance check | `getUserBalance` | OK | |
| 2b | `agent-0.ts` — deduction | `deductCredits` | OK | |
| 3a | `agent-1.ts` — balance check | `getUserBalance` | OK | |
| 3b | `agent-1.ts` — deduction | `deductCredits` | OK | |
| 3c | `agent-1.ts` — parallel variants | Pass-through | OK | |
| 4a | `agent-2` image handler — balance | `assertSufficientCredits` | OK | |
| 4b | `agent-2` image handler — deduction | `deductCredits` | OK | |
| 5a | `video/generate` — balance check | `assertSufficientCredits` | OK | |
| 5b | `video/generate` — deduction | `deductCredits` | OK | |
| 6 | `webhook-handler.ts` — refund | `refundCharge` | OK | Reads accountType from original transaction |
| 7 | `credits/balance` API | Direct DB queries | OK | Branches on `accountType` |
| 8 | `credits` history API | Direct DB queries | OK | Branches on `accountType` |
| 9a | `daily-checkin` — grant | `grantCredits` | OK | Always personal by design |
| 9b | `daily-checkin` — balance | `getUserBalance` | OK | Always personal by design |
| 10 | `onboarding` — signup bonus | `grantCredits` | OK | Always personal by design |
| 11 | `admin/credits` — adjustment | `grantCredits` / `deductCredits` | OK | Explicit `accountType` from request |
| 12 | `admin/team-credits` — adjustment | `grantCredits` / `deductCredits` | OK | Hardcoded `"team"` |
| 13 | `admin/credit-transactions` | Read-only | OK | |
| 14 | `admin/users` | Read-only | OK | |
| 15 | `admin/teams` | Read-only | OK | |
| 16a | `lib/teams.ts` — createTeam | Direct `team_credits` insert | OK | |
| 16b | `lib/teams.ts` — getTeamWithMembers | Read-only | OK | |

### Bugs Found: 1

**`getUserBalance(account.accountId)` in direct image generation** — missing `accountType` parameter caused the function to default to `"personal"`, attempt to insert the team ID into `user_credits.user_id`, and fail with a foreign key violation. Fixed by adding `account.accountType` as the second argument.

### Recommendations

1. **`accountType` is now required** in `getUserBalance`, `assertSufficientCredits`, `deductCredits`, and `grantCredits`. Omitting it is a compile-time error. This was implemented as part of this audit.

2. **Add a runtime guard** in `getUserBalance` auto-create path: before inserting into `user_credits`, verify the `accountId` exists in the `users` table. This would turn FK violations into clear application errors.

3. **The daily check-in and onboarding routes** were updated to explicitly pass `"personal"` to satisfy the new required parameter.
