"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  hasPaymentConsent: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

interface UseSubscriptionReturn {
  hasSubscription: boolean;
  hasPaymentConsent: boolean;
  subscription: SubscriptionStatus["subscription"];
  loading: boolean;
  refresh: () => void;
}

export function useSubscription(): UseSubscriptionReturn {
  const { user } = useAuth();
  const [data, setData] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<SubscriptionStatus>("/api/users/subscription");
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    hasSubscription: data?.hasActiveSubscription ?? false,
    hasPaymentConsent: data?.hasPaymentConsent ?? false,
    subscription: data?.subscription ?? null,
    loading,
    refresh: fetch,
  };
}
