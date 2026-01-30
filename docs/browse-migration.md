# Browse Feature Migration Summary

**Date:** January 29, 2026  
**Source:** `migration-source/app/browse-shots/`  
**Destination:** `app/(dashboard)/browse/`

## Overview

Migrated the video browsing/searching feature from the migration-source project. This includes Redux state management with RTK Query for API calls, and UI components adapted to use HeroUI to match the current project's design system.

## Dependencies Added

```bash
npm install @reduxjs/toolkit react-redux
```

## Files Created

### Redux Infrastructure (`lib/redux/`)

| File | Description |
|------|-------------|
| `store.ts` | Redux store configuration |
| `types.ts` | TypeScript interfaces for QueryState and UIState |
| `utils.ts` | Query parameter building utilities |
| `slices/querySlice.ts` | Search/filter state management (text search, filters, pagination) |
| `slices/uiSlice.ts` | UI state management (showFilters) |
| `services/api.ts` | RTK Query API for videos and properties endpoints |
| `services/base-query.ts` | Base query with automatic auth token refresh on 401 |
| `hooks/useInfiniteContent.ts` | Generic infinite scroll hook with cursor-based pagination |

### Provider (`lib/providers/`)

| File | Description |
|------|-------------|
| `redux-provider.tsx` | Redux provider wrapper (integrated into `app/providers.tsx`) |

### Custom Hooks (`hooks/`)

| File | Description |
|------|-------------|
| `use-auto-expand-filters.ts` | Auto-expand filter tree when filters are selected |
| `use-filter-chips.ts` | Build filter chips from properties for display |
| `use-video-visibility.tsx` | Video visibility tracking with IntersectionObserver (3-zone system) |
| `use-tab-visibility.ts` | Tab visibility detection for pausing videos |

### Browse Components (`components/browse/`)

**Video-specific components (migrated as-is):**

| File | Description |
|------|-------------|
| `VideoGrid.tsx` | Main video grid with infinite scroll |
| `JustifiedGallery.tsx` | Justified layout algorithm for videos |
| `LazyVideo.tsx` | Lazy-loaded video with visibility optimization |
| `VirtualInfiniteScroll.tsx` | Infinite scroll container with IntersectionObserver |

**UI components (adapted to HeroUI):**

| File | Description |
|------|-------------|
| `SearchBar.tsx` | Search input using HeroUI Input |
| `FilterMenu.tsx` | Filter sidebar container |
| `ContentTypeFilter.tsx` | Content type filter using HeroUI Chip |
| `AiGeneratedFilter.tsx` | AI/Non-AI filter using HeroUI Chip |
| `Breadcrumb.tsx` | Breadcrumb with filter chips |
| `FilterChipBar.tsx` | Filter chip display using HeroUI Chip |
| `PropertyFilterTree.tsx` | Recursive property filter tree with HeroUI Checkbox |

### Config (`lib/config/`)

| File | Description |
|------|-------------|
| `video.config.ts` | Video URL configuration and `getVideoUrl()` utility |

### Page

| File | Description |
|------|-------------|
| `app/(dashboard)/browse/page.tsx` | Browse page (currently showing "Coming Soon") |

## Files Modified

| File | Change |
|------|--------|
| `app/providers.tsx` | Added ReduxProvider wrapper |
| `tsconfig.json` | Excluded `migration-source` folder from compilation |

## Not Migrated (as requested)

- **NavSidebar** - Using existing `PrimarySidebar` component
- **SidebarIcons** - Only used by NavSidebar
- **InspirationChat** and related API routes - Not needed

## Environment Variables Required

The browse feature requires these environment variables to be set:

```env
NEXT_PUBLIC_FLASK_URL=https://your-flask-api.com
NEXT_PUBLIC_CLOUDFRONT_URL=https://your-cloudfront-domain.cloudfront.net
```

## API Endpoints Expected

The RTK Query API expects these endpoints from the Flask backend:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/content` | GET | Fetch videos with filters and pagination |
| `/api/properties` | GET | Fetch filter properties tree |

### Query Parameters for `/api/content`

- `text_search` - Search text
- `selected_folders` - Parent property IDs (CSV)
- `selected_filters` - Property value IDs (CSV)
- `content_type` - Content types: shot, image, multishot (CSV)
- `is_aigc` - AI-generated filter: true/false
- `search_id` - Pagination session ID
- `cursor` - Pagination cursor

## Enabling the Browse Feature

When the backend APIs are ready, update `app/(dashboard)/browse/page.tsx`:

1. Remove the "Coming Soon" placeholder
2. Uncomment the actual browse implementation

The file contains clear comments marking what to remove/uncomment.

## Architecture

```
Browse Page
├── SearchBar (HeroUI Input)
├── FilterMenu
│   ├── ContentTypeFilter (HeroUI Chip)
│   ├── AiGeneratedFilter (HeroUI Chip)
│   └── PropertyFilterTree (HeroUI Checkbox)
├── Breadcrumb
│   └── FilterChipBar (HeroUI Chip)
└── VideoGrid
    ├── VirtualInfiniteScroll
    └── VideoVisibilityProvider
        └── JustifiedGallery
            └── LazyVideo (with 3-zone visibility)

Redux State
├── query (search, filters, pagination)
├── ui (showFilters)
└── api (RTK Query cache)
```
