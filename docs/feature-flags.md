# Feature Flags System

A simple, migration-friendly AB testing and feature flag system.

## Overview

This system provides:
- **Testing Groups**: Collections of users for AB testing
- **Feature Flags**: Key-value pairs with type safety (boolean, number, string)
- **Group Overrides**: Different flag values for different testing groups
- **Kill Switch**: Instantly disable any flag globally
- **Migration-Ready**: Designed to easily swap to Statsig/LaunchDarkly later

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  testing_groups │     │  feature_flags  │     │ group_flag_overrides│
│─────────────────│     │─────────────────│     │─────────────────────│
│ id              │◄────│ id              │◄────│ flag_id             │
│ name            │     │ key (unique)    │     │ group_id            │
│ description     │     │ value_type      │     │ value               │
└─────────────────┘     │ default_value   │     └─────────────────────┘
        ▲               │ enabled         │
        │               │ description     │
        │               └─────────────────┘
        │
┌───────┴─────────┐
│     users       │
│─────────────────│
│ testing_groups  │  (array of group UUIDs)
└─────────────────┘
```

## Usage

### Basic Usage (One-Liner)

```tsx
import { useFeatureFlag } from "@/lib/feature-flags";

function MyComponent() {
  // Boolean flag
  const showNewUI = useFeatureFlag<boolean>("new_ui");
  
  if (showNewUI) {
    return <NewUI />;
  }
  return <OldUI />;
}
```

### With Default Values

```tsx
// Number flag with fallback
const maxItems = useFeatureFlag<number>("max_items") ?? 10;

// String flag with fallback
const theme = useFeatureFlag<string>("theme") ?? "light";
```

### Check Loading State

```tsx
import { useFeatureFlag, useFeatureFlagsLoaded } from "@/lib/feature-flags";

function MyComponent() {
  const flagsLoaded = useFeatureFlagsLoaded();
  const showNewUI = useFeatureFlag<boolean>("new_ui");
  
  if (!flagsLoaded) {
    return <LoadingSpinner />;
  }
  
  return showNewUI ? <NewUI /> : <OldUI />;
}
```

### Get All Flags

```tsx
import { useAllFeatureFlags } from "@/lib/feature-flags";

function DebugPanel() {
  const allFlags = useAllFeatureFlags();
  
  return (
    <pre>{JSON.stringify(allFlags, null, 2)}</pre>
  );
}
```

## API Reference

### Hooks

| Hook | Return Type | Description |
|------|-------------|-------------|
| `useFeatureFlag<T>(key)` | `T \| undefined` | Get a single flag value |
| `useFeatureFlagsLoaded()` | `boolean` | Check if flags are loaded |
| `useFeatureFlagsLoading()` | `boolean` | Check if flags are loading |
| `useAllFeatureFlags()` | `Record<string, FlagValue>` | Get all flags |

### Flag Value Types

- `boolean`: `true` or `false`
- `number`: Any numeric value
- `string`: Any string value

## Admin Management

### Testing Groups

Navigate to **Admin > Testing Groups** to:
- Create/edit/delete testing groups
- View user counts per group

### Feature Flags

Navigate to **Admin > Feature Flags** to:
- Create flags with key, type, default value, and description
- Toggle the kill switch (enabled/disabled)
- Add group-specific overrides

### Assigning Users to Groups

In **Admin > User Management**, edit a user to assign them to testing groups.

## Flag Resolution Logic

1. If flag is **disabled** → return `defaultValue`
2. If user is in a group with an **override** → return override value
3. Otherwise → return `defaultValue`

If a user is in multiple groups with overrides for the same flag, the first matching override wins.

## Migration to Statsig/LaunchDarkly

The system is designed for easy migration. When ready:

1. Install the SDK (e.g., `@statsig/react-bindings`)
2. Update `lib/feature-flags/provider.tsx` to use the SDK
3. **No changes needed** in any component using `useFeatureFlag`

Example migration:

```tsx
// lib/feature-flags/provider.tsx

// Before (our API)
export function FeatureFlagProvider({ children }) {
  const { data, isLoading } = useGetFeatureFlagsQuery();
  // ...
}

// After (Statsig)
import { useStatsigClient } from "@statsig/react-bindings";

export function FeatureFlagProvider({ children }) {
  const { client } = useStatsigClient();
  
  const value = {
    getFlag: (key) => client.getDynamicConfig(key).getValue(),
    // ...
  };
  
  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}
```

## Database Schema

### Tables

**testing_groups**
- `id` (UUID, PK)
- `name` (varchar 50, unique)
- `description` (text)
- `created_at`, `updated_at`

**feature_flags**
- `id` (UUID, PK)
- `key` (varchar 16, unique)
- `value_type` ('boolean' | 'number' | 'string')
- `default_value` (text)
- `description` (text)
- `enabled` (boolean, default true)
- `created_at`, `updated_at`

**group_flag_overrides**
- `id` (UUID, PK)
- `flag_id` (UUID, FK → feature_flags)
- `group_id` (UUID, FK → testing_groups)
- `value` (text)
- `created_at`, `updated_at`
- Unique constraint on (flag_id, group_id)

**users.testing_groups**
- JSONB array of group UUIDs

## API Endpoints

### Admin APIs (require admin role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/testing-groups` | List all groups |
| POST | `/api/admin/testing-groups` | Create group |
| PATCH | `/api/admin/testing-groups/[id]` | Update group |
| DELETE | `/api/admin/testing-groups/[id]` | Delete group |
| GET | `/api/admin/feature-flags` | List all flags with overrides |
| POST | `/api/admin/feature-flags` | Create flag |
| PATCH | `/api/admin/feature-flags/[id]` | Update flag |
| DELETE | `/api/admin/feature-flags/[id]` | Delete flag |
| POST | `/api/admin/feature-flags/[id]/overrides` | Add override |
| PATCH | `/api/admin/feature-flags/[id]/overrides/[overrideId]` | Update override |
| DELETE | `/api/admin/feature-flags/[id]/overrides/[overrideId]` | Delete override |

### User API (requires authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/feature-flags` | Get resolved flags for current user |
