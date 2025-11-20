"use client";

import { createContext, useCallback, useEffect, useState, useContext } from "react";
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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string;
  loggingOut: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
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
      // If it's a 401, we might just not be logged in
      setUser(null);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        loggingOut,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

