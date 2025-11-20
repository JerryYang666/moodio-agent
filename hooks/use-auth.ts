"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  authProvider: string;
  createdAt: string;
  updatedAt: string;
}

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string;
  loggingOut: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }
      const data = await response.json();
      setUser(data.user);
      setError("");
    } catch (err) {
      // If it's a 401, we might just not be logged in, which is fine for some pages
      // But here we assume we want to know the user or null
      setUser(null);
      // Don't set error for 401/403 as it might just mean 'not logged in'
      // depending on how the API client handles it.
      // The api client throws on error.
      // If we want to suppress error on initial load if not logged in:
      if (err instanceof Error && (err.message.includes("401") || err.message.includes("Authentication failed"))) {
         // User is not logged in.
      } else {
         setError(err instanceof Error ? err.message : "Failed to load user");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout");
      setUser(null);
      router.push("/auth/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to logout");
    } finally {
      setLoggingOut(false);
    }
  };

  return {
    user,
    loading,
    error,
    loggingOut,
    logout,
    refreshUser: fetchUser,
  };
}

