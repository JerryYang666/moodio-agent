import { createApi } from "@reduxjs/toolkit/query/react";
import { createBaseQueryWithReauth } from "./base-query";
import type { FeatureFlagsResponse } from "@/lib/feature-flags/types";

/**
 * Next.js API slice
 *
 * Separate from the Flask API to keep concerns separated.
 * Uses the same auth/reauth logic.
 */
export const nextApi = createApi({
  reducerPath: "nextApi",
  baseQuery: createBaseQueryWithReauth(""),
  tagTypes: ["FeatureFlags"],

  endpoints: (builder) => ({
    getFeatureFlags: builder.query<FeatureFlagsResponse, void>({
      query: () => "/api/users/feature-flags",
      // Cache for 5 minutes
      keepUnusedDataFor: 300,
      providesTags: ["FeatureFlags"],
    }),
  }),
});

export const { useGetFeatureFlagsQuery } = nextApi;
