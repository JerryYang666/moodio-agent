"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";

interface CreditsContextType {
  balance: number | null;
  loading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!user) {
      setBalance(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api.get("/api/users/credits/balance");
      setBalance(data.balance);
    } catch (err) {
      console.error("Failed to fetch credits balance:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch balance");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch balance when user changes
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const refreshBalance = useCallback(async () => {
    await fetchBalance();
  }, [fetchBalance]);

  return (
    <CreditsContext.Provider
      value={{
        balance,
        loading,
        error,
        refreshBalance,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditsContext);
  if (context === undefined) {
    throw new Error("useCredits must be used within a CreditsProvider");
  }
  return context;
}
