/**
 * Feature Flag Types
 *
 * These types define the interface for the feature flag system.
 * The implementation can be swapped (e.g., to Statsig) without
 * changing any code that uses useFeatureFlag.
 */

export type FlagValue = boolean | number | string;

export interface FeatureFlagContextValue {
  /**
   * Get the value of a feature flag by key.
   * Returns undefined if the flag doesn't exist or isn't loaded yet.
   */
  getFlag<T extends FlagValue>(key: string): T | undefined;

  /**
   * Get all feature flags as a key-value map.
   */
  getAllFlags(): Record<string, FlagValue>;

  /**
   * Whether the feature flags have been loaded.
   */
  isLoaded: boolean;

  /**
   * Whether the feature flags are currently being fetched.
   */
  isLoading: boolean;

  /**
   * Error message if fetching failed.
   */
  error?: string;
}

/**
 * Response type from the feature flags API
 */
export interface FeatureFlagsResponse {
  flags: Record<string, FlagValue>;
}
