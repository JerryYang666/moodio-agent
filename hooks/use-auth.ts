"use client";

import { useContext } from "react";
import { AuthContext, type User } from "@/components/auth-provider";

// Re-export User type for compatibility
export type { User };

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string;
  loggingOut: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
