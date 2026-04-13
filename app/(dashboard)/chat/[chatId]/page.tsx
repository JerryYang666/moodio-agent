"use client";

import ChatInterface from "@/components/chat/chat-interface";
import { use } from "react";
import { useSearchParams } from "next/navigation";

export default function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const searchParams = useSearchParams();
  const scrollToAssetId = searchParams.get("assetId") || undefined;
  const rawTimestamp = searchParams.get("messageTimestamp");
  const scrollToMessageTimestamp = rawTimestamp ? Number(rawTimestamp) : undefined;
  const teamId = searchParams.get("teamId") || undefined;

  return (
    <ChatInterface
      chatId={chatId}
      scrollToAssetId={scrollToAssetId}
      scrollToMessageTimestamp={scrollToMessageTimestamp}
      teamId={teamId}
    />
  );
}
