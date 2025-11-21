"use client";

import { createContext, useCallback, useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePathname, useRouter } from "next/navigation";
import { addToast } from "@heroui/toast";

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
  monitorChat: (chatId: string, startCount: number) => void;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Map of chatId -> initial message count
  const [monitoredChats, setMonitoredChats] = useState<Record<string, number>>({});
  const monitoredChatsRef = useRef<Record<string, number>>({});

  // Update ref when state changes to avoid stale closures in interval
  useEffect(() => {
    monitoredChatsRef.current = monitoredChats;
  }, [monitoredChats]);

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

  const monitorChat = useCallback((chatId: string, startCount: number) => {
    // Only monitor if we have permission or might get it (don't spam if denied)
    if (Notification.permission === "denied") return;

    setMonitoredChats(prev => ({
      ...prev,
      [chatId]: startCount
    }));
  }, []);

  // Polling for monitored chats
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const currentMonitored = monitoredChatsRef.current;
      const chatIds = Object.keys(currentMonitored);

      if (chatIds.length === 0) return;

      for (const chatId of chatIds) {
        try {
          const startCount = currentMonitored[chatId];
          const res = await fetch(`/api/chat/${chatId}`);
          
          if (res.ok) {
            const data = await res.json();
            const currentCount = data.messages.length;

            if (currentCount > startCount) {
              // Generation finished!
              
              // Determine if we should notify
              const isChatOpen = pathname === `/chat/${chatId}`;
              const isHidden = document.hidden;

              // Notify if: Tab is hidden OR User is not on the specific chat page
              if (isHidden || !isChatOpen) {
                if (Notification.permission === "granted") {
                  const notification = new Notification("Moodio Agent", {
                    body: "Your image generation is complete!",
                    icon: "/favicon.ico",
                    tag: chatId // Tag allows replacing old notifications if needed
                  });
                  
                  notification.onclick = () => {
                    window.focus();
                    router.push(`/chat/${chatId}`);
                    notification.close();
                  };
                }
                
                // Also show toast if user is active in app but on different page
                if (!isHidden && !isChatOpen) {
                  addToast({
                    title: "Image Ready",
                    description: "Your image generation is complete!",
                    color: "success",
                    endContent: (
                      <button 
                        onClick={() => router.push(`/chat/${chatId}`)}
                        className="text-xs font-medium underline hover:opacity-80 text-current px-2 py-1 rounded"
                      >
                        View
                      </button>
                    )
                  });
                }
              }

              // Stop monitoring this chat
              setMonitoredChats(prev => {
                const newState = { ...prev };
                delete newState[chatId];
                return newState;
              });
              
              // Refresh chat list as well since something changed
              fetchChats();
            }
          }
        } catch (e) {
          console.error(`Error polling chat ${chatId}`, e);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [pathname, fetchChats]); // Depend on pathname to know current location

  return (
    <ChatContext.Provider
      value={{
        chats,
        loading,
        error,
        refreshChats: fetchChats,
        monitorChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
