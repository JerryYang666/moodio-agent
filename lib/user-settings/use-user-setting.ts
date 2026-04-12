"use client";

import { useContext, useCallback } from "react";
import { UserSettingsContext } from "./provider";
import type { UserSettings, UserSettingsContextValue } from "./types";

function useUserSettingsContext(): UserSettingsContextValue {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error(
      "useUserSetting must be used within a UserSettingsProvider. " +
        "Make sure UserSettingsProvider is in your component tree."
    );
  }
  return context;
}

/**
 * Read a single user setting by key.
 *
 * @example
 * const cnMode = useUserSetting("cnMode"); // boolean
 */
export function useUserSetting<K extends keyof UserSettings>(
  key: K
): Required<UserSettings>[K] {
  const ctx = useUserSettingsContext();
  return ctx.getSetting(key);
}

/**
 * Read all resolved user settings.
 */
export function useUserSettings(): Required<UserSettings> {
  const ctx = useUserSettingsContext();
  return ctx.settings;
}

/**
 * Get a function to update user settings (PATCH).
 *
 * @example
 * const updateSettings = useUpdateSettings();
 * await updateSettings({ cnMode: true });
 */
export function useUpdateSettings(): (
  partial: Partial<UserSettings>
) => Promise<void> {
  const ctx = useUserSettingsContext();
  return useCallback(
    (partial: Partial<UserSettings>) => ctx.updateSettings(partial),
    [ctx]
  );
}

/**
 * Check if user settings have been loaded.
 */
export function useUserSettingsLoaded(): boolean {
  const context = useContext(UserSettingsContext);
  return context?.isLoaded ?? false;
}
