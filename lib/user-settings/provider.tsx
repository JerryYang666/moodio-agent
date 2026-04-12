"use client";

import React, { createContext, useMemo, useCallback } from "react";
import {
  useGetUserSettingsQuery,
  useUpdateUserSettingsMutation,
} from "@/lib/redux/services/next-api";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_USER_SETTINGS } from "./types";
import type { UserSettingsContextValue, UserSettings } from "./types";

export const UserSettingsContext =
  createContext<UserSettingsContextValue | null>(null);

interface UserSettingsProviderProps {
  children: React.ReactNode;
}

export function UserSettingsProvider({ children }: UserSettingsProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const isAuthenticated = !!user;

  const { data, isLoading, isSuccess } = useGetUserSettingsQuery(undefined, {
    skip: authLoading || !isAuthenticated,
    pollingInterval: 60 * 60 * 1000, // revalidate every hour
  });

  const [mutate] = useUpdateUserSettingsMutation();

  const resolved = useMemo(
    () => ({ ...DEFAULT_USER_SETTINGS, ...(data?.settings ?? {}) }),
    [data]
  );

  const updateSettings = useCallback(
    async (partial: Partial<UserSettings>) => {
      await mutate(partial).unwrap();
    },
    [mutate]
  );

  const value = useMemo<UserSettingsContextValue>(
    () => ({
      getSetting: <K extends keyof UserSettings>(
        key: K
      ): Required<UserSettings>[K] => resolved[key],
      settings: resolved,
      updateSettings,
      isLoaded: !authLoading && (isSuccess || !isAuthenticated),
      isLoading: authLoading || isLoading,
    }),
    [resolved, updateSettings, authLoading, isSuccess, isAuthenticated, isLoading]
  );

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}
