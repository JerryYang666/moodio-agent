"use client";

import { createContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export interface Chat {
  id: string;
  name: string | null;
  updatedAt: string;
}

interface ChatContextType {
  chats: Chat[];
  loading: boolean;
  error: string;
  refreshChats: () => Promise<void>;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchChats = useCallback(async () => {
    if (!user) {
      setChats([]);
      return;
    }
    
    try {
      setLoading(true);
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
        setError("");
      } else {
        throw new Error("Failed to fetch chats");
      }
    } catch (err) {
      console.error("Failed to fetch chats", err);
      setError("Failed to fetch chats");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchChats();

    const handleRefreshChats = () => {
      fetchChats();
    };

    window.addEventListener("refresh-chats", handleRefreshChats);
    return () => {
      window.removeEventListener("refresh-chats", handleRefreshChats);
    };
  }, [fetchChats]);

  return (
    <ChatContext.Provider
      value={{
        chats,
        loading,
        error,
        refreshChats: fetchChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

