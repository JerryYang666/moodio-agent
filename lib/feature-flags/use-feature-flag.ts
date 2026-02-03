"use client";

import { useContext } from "react";
import { FeatureFlagContext } from "./provider";
import type { FlagValue } from "./types";

/**
 * Hook to get a feature flag value.
 *
 * @param key - The feature flag key (e.g., "dark_mode", "new_ui")
 * @returns The flag value, or undefined if not found/not loaded
 *
 * @example
 * // Boolean flag
 * const showNewUI = useFeatureFlag<boolean>("new_ui");
 * if (showNewUI) {
 *   return <NewUI />;
 * }
 *
 * @example
 * // Number flag
 * const maxItems = useFeatureFlag<number>("max_items") ?? 10;
 *
 * @example
 * // String flag
 * const theme = useFeatureFlag<string>("theme") ?? "light";
 */
export function useFeatureFlag<T extends FlagValue>(key: string): T | undefined {
  const context = useContext(FeatureFlagContext);

  if (!context) {
    throw new Error(
      "useFeatureFlag must be used within a FeatureFlagProvider. " +
        "Make sure FeatureFlagProvider is in your component tree."
    );
  }

  return context.getFlag<T>(key);
}

/**
 * Hook to check if feature flags have been loaded.
 *
 * @returns true if flags are loaded, false otherwise
 *
 * @example
 * const flagsLoaded = useFeatureFlagsLoaded();
 * if (!flagsLoaded) {
 *   return <LoadingSpinner />;
 * }
 */
export function useFeatureFlagsLoaded(): boolean {
  const context = useContext(FeatureFlagContext);
  return context?.isLoaded ?? false;
}

/**
 * Hook to check if feature flags are currently loading.
 *
 * @returns true if flags are loading, false otherwise
 */
export function useFeatureFlagsLoading(): boolean {
  const context = useContext(FeatureFlagContext);
  return context?.isLoading ?? false;
}

/**
 * Hook to get all feature flags.
 *
 * @returns Record of all flag key-value pairs
 *
 * @example
 * const allFlags = useAllFeatureFlags();
 * console.log("Current flags:", allFlags);
 */
export function useAllFeatureFlags(): Record<string, FlagValue> {
  const context = useContext(FeatureFlagContext);

  if (!context) {
    throw new Error(
      "useAllFeatureFlags must be used within a FeatureFlagProvider."
    );
  }

  return context.getAllFlags();
}
