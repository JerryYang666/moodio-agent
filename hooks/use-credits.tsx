"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetCreditsBalanceQuery } from "@/lib/redux/services/next-api";

interface UseCreditsReturn {
  balance: number | null;
  loading: boolean;
  error: string | null;
  refreshBalance: () => void;
}

/**
 * Hook to access user's credit balance using RTK Query.
 *
 * Benefits over the previous Context-based approach:
 * - Automatic cache invalidation when video generation succeeds
 * - No need for manual refreshBalance() calls in most cases
 * - Shared cache across all components using this hook
 * - Built-in loading and error states
 *
 * The balance automatically updates when:
 * - User logs in/out
 * - Video generation completes (via cache tag invalidation)
 * - refreshBalance() is called manually
 */
export function useCredits(): UseCreditsReturn {
  const { user } = useAuth();

  // Skip the query if user is not logged in
  const { data, isLoading, error, refetch } = useGetCreditsBalanceQuery(undefined, {
    skip: !user,
  });

  // Provide a manual refresh function for edge cases
  const refreshBalance = useCallback(() => {
    if (user) {
      refetch();
    }
  }, [user, refetch]);

  return {
    balance: user ? (data?.balance ?? null) : null,
    loading: isLoading,
    error: error ? "Failed to fetch balance" : null,
    refreshBalance,
  };
}
