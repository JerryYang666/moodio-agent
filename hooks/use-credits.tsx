"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@/hooks/use-auth";
import { useGetCreditsBalanceQuery, useGetUserTeamsQuery } from "@/lib/redux/services/next-api";
import { setActiveAccountLocal } from "@/lib/redux/slices/activeAccountSlice";
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
  const dispatch = useDispatch();
  const { accountType, accountId, teamName } = useSelector(
    (state: RootState) => state.activeAccount
  );

  const { data, isLoading, error, refetch } = useGetCreditsBalanceQuery(
    undefined,
    { skip: !user }
  );
  const { data: teams } = useGetUserTeamsQuery(undefined, { skip: !user });

  // Sync Redux slice from the balance response (single source of truth)
  const prevAccountKey = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const key = `${data.accountType}:${data.accountId}`;
    if (key === prevAccountKey.current) return;
    prevAccountKey.current = key;

    if (data.accountType === "team" && data.accountId) {
      const team = teams?.find((t) => t.teamId === data.accountId);
      dispatch(
        setActiveAccountLocal({
          accountType: "team",
          accountId: data.accountId,
          teamName: team?.teamName ?? null,
        })
      );
    } else {
      dispatch(
        setActiveAccountLocal({
          accountType: "personal",
          accountId: null,
          teamName: null,
        })
      );
    }
  }, [data, teams, dispatch]);

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
