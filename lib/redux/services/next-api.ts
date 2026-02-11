import { createApi } from "@reduxjs/toolkit/query/react";
import { createBaseQueryWithReauth } from "./base-query";
import type { FeatureFlagsResponse } from "@/lib/feature-flags/types";

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

/**
 * Next.js API slice
 *
 * Separate from the Flask API to keep concerns separated.
 * Uses the same auth/reauth logic.
 */
export const nextApi = createApi({
  reducerPath: "nextApi",
  baseQuery: createBaseQueryWithReauth(""),
  tagTypes: ["FeatureFlags", "Credits"],

  endpoints: (builder) => ({
    getFeatureFlags: builder.query<FeatureFlagsResponse, void>({
      query: () => "/api/users/feature-flags",
      // Cache for 5 minutes
      keepUnusedDataFor: 300,
      providesTags: ["FeatureFlags"],
    }),

    // Credits balance endpoint
    getCreditsBalance: builder.query<CreditsBalanceResponse, void>({
      query: () => "/api/users/credits/balance",
      providesTags: ["Credits"],
    }),

    // Video generation mutation - invalidates Credits cache on success
    generateVideo: builder.mutation<GenerateVideoResponse, GenerateVideoRequest>({
      query: (body) => ({
        url: "/api/video/generate",
        method: "POST",
        body,
      }),
      // Invalidate credits cache when video generation succeeds
      // This triggers automatic refetch of credits balance
      invalidatesTags: ["Credits"],
    }),
  }),
});

export const {
  useGetFeatureFlagsQuery,
  useGetCreditsBalanceQuery,
  useGenerateVideoMutation,
} = nextApi;
