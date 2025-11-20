"use client";

import ChatInterface from "@/components/chat/chat-interface";
import { use } from "react";

export default function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  return <ChatInterface chatId={chatId} />;
}
