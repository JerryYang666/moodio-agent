"use client";

import React, { createContext, useMemo } from "react";
import { useGetFeatureFlagsQuery } from "@/lib/redux/services/next-api";
import type { FeatureFlagContextValue, FlagValue } from "./types";

/**
 * Feature Flag Context
 *
 * This context provides access to feature flags throughout the app.
 * The implementation uses our own API, but can be swapped to use
 * Statsig, LaunchDarkly, or any other provider by changing only
 * this file.
 */
export const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(
  null
);

interface FeatureFlagProviderProps {
  children: React.ReactNode;
}

/**
 * Feature Flag Provider
 *
 * Wraps the app and provides feature flag values to all components.
 * Uses RTK Query to fetch flags from our API.
 *
 * To migrate to Statsig/LaunchDarkly:
 * 1. Install the SDK
 * 2. Replace the implementation below with SDK calls
 * 3. Keep the same context interface
 * 4. Zero changes needed in components using useFeatureFlag
 */
export function FeatureFlagProvider({ children }: FeatureFlagProviderProps) {
  const { data, isLoading, error, isSuccess } = useGetFeatureFlagsQuery(
    undefined,
    {
      // Refetch when window regains focus
      refetchOnFocus: true,
      // Poll every 5 minutes for updates
      pollingInterval: 5 * 60 * 1000,
    }
  );

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      getFlag: <T extends FlagValue>(key: string): T | undefined => {
        return data?.flags[key] as T | undefined;
      },
      getAllFlags: () => data?.flags ?? {},
      isLoaded: isSuccess,
      isLoading,
      error: error ? "Failed to load feature flags" : undefined,
    }),
    [data, isLoading, isSuccess, error]
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/*
 * Example: Statsig Migration
 *
 * To migrate to Statsig, replace the provider implementation:
 *
 * import { useStatsigClient } from "@statsig/react-bindings";
 *
 * export function FeatureFlagProvider({ children }: FeatureFlagProviderProps) {
 *   const { client } = useStatsigClient();
 *
 *   const value = useMemo<FeatureFlagContextValue>(
 *     () => ({
 *       getFlag: <T extends FlagValue>(key: string): T | undefined => {
 *         const config = client.getDynamicConfig(key);
 *         return config.getValue() as T | undefined;
 *       },
 *       getAllFlags: () => {
 *         // Statsig doesn't have a direct "get all" - you'd need to track keys
 *         return {};
 *       },
 *       isLoaded: true,
 *       isLoading: false,
 *     }),
 *     [client]
 *   );
 *
 *   return (
 *     <FeatureFlagContext.Provider value={value}>
 *       {children}
 *     </FeatureFlagContext.Provider>
 *   );
 * }
 */
