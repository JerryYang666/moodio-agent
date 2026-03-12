import { createApi } from "@reduxjs/toolkit/query/react";
import { createBaseQueryWithReauth } from "./base-query";
import type { FeatureFlagsResponse } from "@/lib/feature-flags/types";
import type { Permission } from "@/lib/permissions";

// Types for credits
export interface CreditsBalanceResponse {
  balance: number;
}

// Types for video generation
export interface GenerateVideoRequest {
  modelId?: string;
  sourceImageId: string;
  endImageId?: string | null;
  params: Record<string, unknown>;
}

export interface GenerateVideoResponse {
  success: boolean;
  generationId: string;
  falRequestId: string;
  status: string;
}

export interface GenerateVideoError {
  error: string;
  cost?: number;
}

// Types for collection tags
export interface CollectionTagItem {
  id: string;
  label: string;
  color: string;
}

// Types for collections
export interface CollectionItem {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permission: Permission;
  isOwner: boolean;
  sharedAt?: Date;
  coverImageUrl?: string | null;
  tags: CollectionTagItem[];
}

/**
 * Next.js API slice
 *
 * Separate from the Flask API to keep concerns separated.
 * Uses the same auth/reauth logic.
 */
export const nextApi = createApi({
  reducerPath: "nextApi",
  baseQuery: createBaseQueryWithReauth(""),
  tagTypes: ["FeatureFlags", "Credits", "Collections"],

  endpoints: (builder) => ({
    getFeatureFlags: builder.query<FeatureFlagsResponse, void>({
      query: () => "/api/users/feature-flags",
      keepUnusedDataFor: 300,
      providesTags: ["FeatureFlags"],
    }),

    getCreditsBalance: builder.query<CreditsBalanceResponse, void>({
      query: () => "/api/users/credits/balance",
      providesTags: ["Credits"],
    }),

    generateVideo: builder.mutation<GenerateVideoResponse, GenerateVideoRequest>({
      query: (body) => ({
        url: "/api/video/generate",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Credits"],
    }),

    getCollections: builder.query<CollectionItem[], void>({
      query: () => "/api/collection",
      transformResponse: (response: { collections: CollectionItem[] }) =>
        response.collections ?? [],
      providesTags: ["Collections"],
      keepUnusedDataFor: 120,
    }),

    createCollection: builder.mutation<
      CollectionItem,
      { name: string; projectId?: string; tags?: { label: string; color: string }[] }
    >({
      query: (body) => ({
        url: "/api/collection",
        method: "POST",
        body,
      }),
      transformResponse: (response: { collection: CollectionItem }) =>
        response.collection,
      invalidatesTags: ["Collections"],
    }),

    renameCollection: builder.mutation<
      CollectionItem,
      { collectionId: string; name?: string; tags?: { label: string; color: string }[] }
    >({
      query: ({ collectionId, ...body }) => ({
        url: `/api/collection/${collectionId}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response: { collection: CollectionItem }) =>
        response.collection,
      invalidatesTags: ["Collections"],
    }),

    deleteCollection: builder.mutation<void, string>({
      query: (collectionId) => ({
        url: `/api/collection/${collectionId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Collections"],
    }),
  }),
});

export const {
  useGetFeatureFlagsQuery,
  useGetCreditsBalanceQuery,
  useGenerateVideoMutation,
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useRenameCollectionMutation,
  useDeleteCollectionMutation,
} = nextApi;
