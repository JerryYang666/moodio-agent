import { createApi } from "@reduxjs/toolkit/query/react";
import type { QueryState } from "../types";
import { buildApiQueryParams } from "../utils";
import { createBaseQueryWithReauth } from "./base-query";
import type { TaxonomyPropertyNode } from "@/lib/filterGrouping";

// Constants
const API_BASE_URL = `${process.env.NEXT_PUBLIC_FLASK_URL}/api`;

// API Response Types
export interface Video {
  id: number;
  content_uuid: string;
  storage_key: string;
  content_type?: string; // "shot", "multishot", "image"
  is_aigc?: boolean;
  content_metadata?: Record<string, unknown>; // JSON metadata from backend
  width: number;  // Video width in pixels (for justified gallery layout)
  height: number; // Video height in pixels (for justified gallery layout)
  created_at: string;
  captions: string[];
  properties: Array<{
    property_id: number;
    property_name: string;
    parent_property?: {
      id: number;
      name: string;
    };
    value_id: number;
    value: string;
    confidence_score: number;
    labeler: string;
  }>;
  // Multishot/subshot support
  parent_content?: {
    id: number;
    content_uuid: string;
    content_type: string;
  };
  start_time?: number; // For subshots (in seconds)
  end_time?: number; // For subshots (in seconds)
  subshots?: Array<{
    id: number;
    content_uuid: string;
    start_time: number;
    end_time: number;
  }>; // For multishots
}

export interface VideosResponse {
  content: Video[];
  videos: Video[];
  has_more: boolean;
  total_content: number;
  total_videos: number;
  cursor?: string | null;
  search_id?: string | null;
  strategy_name?: string | null; // Retrieval strategy identifier (may encode versioning)
}

export interface PropertyValue {
  id: number;
  value: string;
  description?: string | null;
  property_id: number | null;
  display_order?: number | null;
  hidden?: boolean; // Direct hidden flag
  effective_hidden?: boolean; // Inherited hidden (via parent property)
}

// Property can also represent a root-level PropertyValue (when 'value' is present and 'name' is not)
export interface Property {
  id: number;
  name?: string;  // Optional for root-level PropertyValues
  value?: string;  // Only present for root-level PropertyValues
  property_id?: number | null;
  display_order?: number | null;
  hidden?: boolean; // Direct hidden flag (admin-set)
  effective_hidden?: boolean; // Inherited hidden (hidden via parent property)
  values: PropertyValue[];
  children: Property[]; // Recursive reference for unlimited nesting
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: createBaseQueryWithReauth(API_BASE_URL),
  tagTypes: ["Videos", "Properties"],

  endpoints: (builder) => ({
    getVideos: builder.query<VideosResponse, { queryState: QueryState; properties: TaxonomyPropertyNode[] }>({
      query: ({ queryState, properties }) => {
        const params = buildApiQueryParams(queryState, properties);
        return `/content?${params.toString()}`;
      },

      // Transform backend response to frontend format
      transformResponse: (response: {
        content: Video[];
        has_more: boolean;
        total_content: number;
        search_id?: string | null;
        next_cursor?: string | null;
        strategy_name?: string | null;
      }) => ({
        content: response.content,
        videos: response.content,
        has_more: response.has_more,
        total_content: response.total_content,
        total_videos: response.total_content,
        cursor: response.next_cursor ?? null,
        search_id: response.search_id ?? null,
        strategy_name: response.strategy_name ?? null,
      }),

      // Keep unused data for 60 seconds to allow quick navigation back without refetching
      // This reduces churn and makes returning to the video grid feel more seamless
      keepUnusedDataFor: 60,

      // Cache based on intent (search+filters), NOT cursor/searchId
      // This ensures same intent = same cache entry, regardless of pagination state
      serializeQueryArgs: ({ queryArgs }) => {
        const { queryState } = queryArgs;
        const { textSearch, selectedFolders, selectedFilters, contentTypes, isAigc } = queryState;
        // Include contentTypes and isAigc in cache key since they affect results
        // Sort contentTypes array for consistent cache key regardless of selection order
        const sortedContentTypes = [...contentTypes].sort().join(",");
        return `videos-${textSearch}-${selectedFolders.join(",")}-${selectedFilters.join(",")}-${sortedContentTypes}-${isAigc ?? ""}`;
      },

      // Merge pages for infinite scroll functionality
      // Handles deduplication when searchId changes (session expired/recomputed)
      merge: (currentCache, newData, { arg }) => {
        if (!newData?.content) return currentCache;

        // If this is a new search (no cursor), replace cache entirely
        if (!arg.queryState.cursor) {
          return newData;
        }

        // Continuation: append new content, deduplicating by ID
        // This handles the case where searchId changed (session expired) and we got
        // some overlapping results from recomputation
        if (currentCache?.content) {
          const existingIds = new Set(currentCache.content.map((v) => v.id));
          const newContent = newData.content.filter((v) => !existingIds.has(v.id));
          const mergedContent = [...currentCache.content, ...newContent];

          return {
            ...newData,
            content: mergedContent,
            videos: mergedContent, // Keep videos in sync with content
          };
        }

        // Fallback: replace cache
        return newData;
      },

      // Force refetch when intent changes OR cursor changes
      // Intent changes: search/filters/contentTypes/isAigc
      // Cursor changes: user scrolled to next page
      forceRefetch({ currentArg, previousArg }) {
        const cur = currentArg?.queryState;
        const prev = previousArg?.queryState;
        // Intent changed
        if (
          cur?.textSearch !== prev?.textSearch ||
          JSON.stringify(cur?.selectedFolders) !== JSON.stringify(prev?.selectedFolders) ||
          JSON.stringify(cur?.selectedFilters) !== JSON.stringify(prev?.selectedFilters) ||
          JSON.stringify([...(cur?.contentTypes || [])].sort()) !== JSON.stringify([...(prev?.contentTypes || [])].sort()) ||
          cur?.isAigc !== prev?.isAigc
        ) {
          return true;
        }

        // Cursor changed (pagination)
        if (cur?.cursor !== prev?.cursor) {
          return true;
        }

        return false;
      },
    }),

    getProperties: builder.query<Property[], string>({
      query: (lang) => `/properties?lang=${encodeURIComponent(lang)}`,
      // Cache properties aggressively since they rarely change
      keepUnusedDataFor: 1800,
    }),
  }),
});

export const {
  useGetVideosQuery,
  useGetPropertiesQuery,
} = api;
