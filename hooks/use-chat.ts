"use client";

import { useContext } from "react";
import { ChatContext, type Chat } from "@/components/chat-provider";

export type { Chat };

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

