/**
 * Feature Flags Library
 *
 * A simple, migration-friendly feature flag system.
 *
 * Usage:
 * ```tsx
 * import { useFeatureFlag } from "@/lib/feature-flags";
 *
 * function MyComponent() {
 *   const showNewUI = useFeatureFlag<boolean>("new_ui");
 *
 *   if (showNewUI) {
 *     return <NewUI />;
 *   }
 *   return <OldUI />;
 * }
 * ```
 *
 * The implementation can be swapped to Statsig, LaunchDarkly, etc.
 * by changing only the provider - no changes needed in components.
 */

export { FeatureFlagProvider, FeatureFlagContext } from "./provider";
export {
  useFeatureFlag,
  useFeatureFlagsLoaded,
  useFeatureFlagsLoading,
  useAllFeatureFlags,
} from "./use-feature-flag";
export type {
  FlagValue,
  FeatureFlagContextValue,
  FeatureFlagsResponse,
} from "./types";
