# Persistent Chat Assets - Implementation Plan

## Overview
Replace the existing reference images feature (localStorage-based, behind feature flag) with a unified "Persistent Chat Assets" system stored server-side in the S3 chat JSON. Assets include reference images and a persistent text chunk. These bypass the 15-message context limit and are always sent to the LLM.

## UI: Large popover triggered from upper-right button in chat
- Text chunk: max 5000 characters
- No migration from old localStorage data - start fresh

---

## Phase 1: Types & Storage Layer

### 1.1 Define PersistentAssets types
**New file: `lib/chat/persistent-assets-types.ts`**
```typescript
import { ReferenceImageTag } from "@/components/chat/reference-image-types";

export interface PersistentReferenceImage {
  imageId: string;
  tag: ReferenceImageTag;
  title?: string;
}

export interface PersistentAssets {
  referenceImages: PersistentReferenceImage[];
  textChunk: string;
}

export const EMPTY_PERSISTENT_ASSETS: PersistentAssets = {
  referenceImages: [],
  textChunk: "",
};

export const MAX_TEXT_CHUNK_LENGTH = 5000;
export const MAX_REFERENCE_IMAGES = 4;
```

### 1.2 Update S3 storage format
**File: `lib/storage/s3.ts`**
- Change `ChatHistory` interface from `{ messages }` to `{ messages, persistentAssets? }`
- Update `saveChatHistory()` to accept and persist `persistentAssets`
- Update `getChatHistory()` to return `persistentAssets` (defaulting to empty if absent for backward compat)
- Add `savePersistentAssets(chatId, assets)` - loads existing chat JSON, updates just the persistentAssets field, saves back
- Add `getPersistentAssets(chatId)` - loads chat JSON, returns just persistentAssets

### 1.3 Update chat GET endpoint to return persistent assets
**File: `app/api/chat/[chatId]/route.ts`**
- GET response now includes `persistentAssets` alongside `chat` and `messages`
- Add imageUrl derived URLs for persistent reference images

---

## Phase 2: API Endpoints

### 2.1 New persistent assets endpoint
**New file: `app/api/chat/[chatId]/persistent-assets/route.ts`**

**GET** - Load persistent assets for a chat
- Auth check + ownership verification
- Returns `{ persistentAssets }` with reference image URLs derived

**PUT** - Save/update persistent assets for a chat
- Auth check + ownership verification
- Validates: max 4 reference images, text chunk ≤ 5000 chars, valid tags
- Loads existing chat JSON from S3, updates persistentAssets field, saves back
- Returns `{ persistentAssets }` with derived URLs

---

## Phase 3: Backend Agent Integration

### 3.1 Update agent to use persistent assets from S3
**File: `app/api/chat/[chatId]/message/route.ts`**
- When processing a message, load `persistentAssets` from the chat history S3 data
- Pass `persistentAssets` into the agent context (no longer from message payload)
- Keep accepting `referenceImages` in message payload for backward compat but prefer S3 persistent assets
- Reference image IDs from persistent assets should be stored in each message's metadata

### 3.2 Update RequestContext
**File: `lib/agents/agent-2/context.ts`**
- Add `persistentAssets: PersistentAssets` to `RequestContext`
- `referenceImages` field populated from `persistentAssets.referenceImages`

### 3.3 Update system prompt for text chunk
**File: `lib/agents/agent-2/core/system-prompt.ts`**
- If `persistentAssets.textChunk` is non-empty, append it to the end of the system prompt
- Format: `\n\n## User's Persistent Context\n{textChunk}`

### 3.4 Update input parser for persistent reference images
**File: `lib/agents/agent-2/core/input-parser.ts`**
- Reference images from persistent assets are always included, bypassing the 15-message filter
- They get injected as a special "persistent context" block at the start of the message list (before filtered messages)

### 3.5 Force image edit mode when reference images exist
**File: `lib/agents/agent-2/index.ts`** and relevant tool handlers
- If `persistentAssets.referenceImages.length > 0`, force all image generation to use "edit" mode
- Pass reference image IDs to the image generation/edit calls

---

## Phase 4: Frontend - Persistent Assets Panel

### 4.1 Redux state for persistent assets
**New file: `lib/redux/slices/persistent-assets-slice.ts`**
- State: `{ assets: PersistentAssets, loading, saving, panelOpen }`
- Actions: `setAssets`, `addReferenceImage`, `removeReferenceImage`, `updateReferenceImageTag`, `setTextChunk`, `togglePanel`
- Thunks: `fetchPersistentAssets(chatId)`, `savePersistentAssets(chatId, assets)`

### 4.2 RTK Query API service
**File: `lib/redux/services/` (new or existing)**
- `getPersistentAssets(chatId)` query
- `updatePersistentAssets(chatId, assets)` mutation

### 4.3 Persistent Assets Popover Component
**New file: `components/chat/persistent-assets-panel.tsx`**
- Trigger button: icon button in upper-right of chat (e.g., pin/bookmark icon)
- Badge indicator showing count of assets when panel is closed
- Large popover content:
  - **Reference Images section**: Grid of image thumbnails with tag dropdowns and remove buttons, add button (opens asset picker)
  - **Text Chunk section**: Textarea with character counter (0/5000), auto-save on blur or debounced
- Save button to persist changes to server

### 4.4 Integrate popover button into chat UI
**File: `components/chat/chat-interface.tsx`**
- Add the persistent assets button to the upper-right corner of the chat area
- Load persistent assets when chat loads (from GET chat response)
- Wire up the panel component

---

## Phase 5: Cleanup

### 5.1 Remove old reference images UI from chat-input
**File: `components/chat/chat-input.tsx`**
- Remove the entire reference images section (lines ~573-740)
- Remove all reference image state management from this component
- Remove the `showReferenceImages` feature flag check

### 5.2 Remove feature flag usage
- Remove `useFeatureFlag("reference_images")` from chat-input.tsx
- Feature is always available

### 5.3 Clean up old reference image localStorage utils
- Keep `components/chat/reference-image-types.ts` (still used for tag types)
- Delete or deprecate `components/chat/reference-image-utils.ts` (localStorage utils no longer needed)

### 5.4 Update message sending
**File: `components/chat/chat-interface.tsx`**
- Remove sending `referenceImages` in message payload (no longer needed - server reads from S3)
- Clean up related state and handlers

---

## Implementation Order
1. Phase 1 (Types & Storage) - foundation
2. Phase 2 (API) - endpoints
3. Phase 3 (Backend Agent) - make persistent assets work in LLM pipeline
4. Phase 4 (Frontend) - UI
5. Phase 5 (Cleanup) - remove old code

## Backward Compatibility
- Old chat JSONs without `persistentAssets` field work fine (default to empty)
- Old localStorage reference images are NOT migrated (per user request)
- Message payload `referenceImages` field kept temporarily for backward compat but server prefers S3 persistent assets
