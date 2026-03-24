"use client";

import { useCallback } from "react";
import { useSelector } from "react-redux";
import { useAuth } from "@/hooks/use-auth";
import { useGetCreditsBalanceQuery } from "@/lib/redux/services/next-api";
import type { RootState } from "@/lib/redux/store";

interface UseCreditsReturn {
  balance: number | null;
  loading: boolean;
  error: string | null;
  refreshBalance: () => void;
  activeAccountType: "personal" | "team";
  activeAccountId: string | null;
  activeTeamName: string | null;
}

export function useCredits(): UseCreditsReturn {
  const { user } = useAuth();
  const { accountType, accountId, teamName } = useSelector(
    (state: RootState) => state.activeAccount
  );

  const queryParams =
    accountType === "team" && accountId
      ? { accountType: accountType as "team", accountId }
      : undefined;

  const { data, isLoading, error, refetch } = useGetCreditsBalanceQuery(
    queryParams,
    { skip: !user }
  );

  const refreshBalance = useCallback(() => {
    if (user) {
      try {
        refetch();
      } catch {
        // Query not started yet
      }
    }
  }, [user, refetch]);

  return {
    balance: user ? (data?.balance ?? null) : null,
    loading: isLoading,
    error: error ? "Failed to fetch balance" : null,
    refreshBalance,
    activeAccountType: accountType,
    activeAccountId: accountId,
    activeTeamName: teamName,
  };
}
