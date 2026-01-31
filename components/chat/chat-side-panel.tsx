"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import {
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
  MessageSquare,
} from "lucide-react";

import ChatInterface from "./chat-interface";
import { ChatHistorySelector } from "./chat-history-selector";
import { siteConfig } from "@/config/site";
import { Message } from "@/lib/llm/types";

// Min and max width constraints for the resizable panel
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 380;
const COLLAPSED_WIDTH = 48;

export interface ChatSidePanelProps {
  /** Whether the panel is expanded by default (true by default) */
  defaultExpanded?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
  /** Callback when panel width changes */
  onWidthChange?: (width: number) => void;
  /** Custom class name */
  className?: string;
}

/**
 * A collapsible and resizable side panel containing the chat interface.
 * Used on pages like storyboard to provide chat functionality alongside other content.
 */
export default function ChatSidePanel({
  defaultExpanded = true,
  onCollapseChange,
  onWidthChange,
  className,
}: ChatSidePanelProps) {
  const router = useRouter();
  const t = useTranslations("chat");
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(undefined);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  
  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const stored = localStorage.getItem(siteConfig.chatPanelWidth);
    return stored ? Math.min(Math.max(parseInt(stored, 10), MIN_PANEL_WIDTH), MAX_PANEL_WIDTH) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Load active chat ID from localStorage on mount
  // "new" is a special marker indicating new chat state (no chatId yet)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedChatId = localStorage.getItem(siteConfig.activeChatId);
      if (storedChatId && storedChatId !== "new") {
        setActiveChatId(storedChatId);
      } else {
        // Either no stored value or "new" marker - show fresh chat
        setActiveChatId(undefined);
      }
    }
  }, []);

  // Listen for storage changes from other tabs/pages
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === siteConfig.activeChatId) {
        if (e.newValue && e.newValue !== "new") {
          setActiveChatId(e.newValue);
          setInitialMessages([]); // Clear messages to trigger reload
        } else {
          // "new" marker or removed - show fresh chat
          setActiveChatId(undefined);
          setInitialMessages([]);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Fetch chat messages when activeChatId changes
  useEffect(() => {
    const fetchChat = async () => {
      if (!activeChatId) {
        setInitialMessages([]);
        return;
      }

      setIsLoadingChat(true);
      try {
        const res = await fetch(`/api/chat/${activeChatId}`);
        if (res.ok) {
          const data = await res.json();
          setInitialMessages(data.messages || []);
        } else {
          // Chat not found, clear the active chat
          setInitialMessages([]);
          setActiveChatId(undefined);
          localStorage.removeItem(siteConfig.activeChatId);
        }
      } catch (error) {
        console.error("Failed to fetch chat:", error);
        setInitialMessages([]);
      } finally {
        setIsLoadingChat(false);
      }
    };

    fetchChat();
  }, [activeChatId]);

  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
    onWidthChange?.(newCollapsed ? COLLAPSED_WIDTH : panelWidth);
    
    // Persist preference
    if (typeof window !== "undefined") {
      localStorage.setItem(siteConfig.chatPanelCollapsed, String(newCollapsed));
    }
  }, [isCollapsed, onCollapseChange, onWidthChange, panelWidth]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = {
      startX: e.clientX,
      startWidth: panelWidth,
    };
    setIsResizing(true);
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      
      // Calculate new width (dragging left increases width since panel is on right)
      const deltaX = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(
        Math.max(resizeRef.current.startWidth + deltaX, MIN_PANEL_WIDTH),
        MAX_PANEL_WIDTH
      );
      
      setPanelWidth(newWidth);
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      if (resizeRef.current) {
        // Persist the width
        localStorage.setItem(siteConfig.chatPanelWidth, String(panelWidth));
      }
      resizeRef.current = null;
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, panelWidth, onWidthChange]);

  // Notify parent of initial width on mount
  useEffect(() => {
    if (!isCollapsed) {
      onWidthChange?.(panelWidth);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = useCallback(() => {
    setActiveChatId(undefined);
    setInitialMessages([]);
    // Set "new" marker to indicate new chat state
    localStorage.setItem(siteConfig.activeChatId, "new");
    // Dispatch reset event for ChatInterface
    window.dispatchEvent(new CustomEvent("reset-chat"));
  }, []);

  const handleChatSelect = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setInitialMessages([]); // Clear to trigger reload
    localStorage.setItem(siteConfig.activeChatId, chatId);
  }, []);

  // Handle when ChatInterface creates a new chat
  const handleChatCreated = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    localStorage.setItem(siteConfig.activeChatId, chatId);
  }, []);

  // Collapsed state - show only expand button
  if (isCollapsed) {
    return (
      <div
        className={clsx(
          "h-full flex flex-col items-center py-4 bg-background border-l border-divider",
          className
        )}
        style={{ width: COLLAPSED_WIDTH }}
      >
        <Button
          isIconOnly
          variant="light"
          size="sm"
          onPress={handleToggleCollapse}
          title={t("expandChat")}
          className="mb-2"
        >
          <PanelRightOpen size={20} />
        </Button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <MessageSquare size={20} className="text-default-400 mb-2" />
          <span className="text-xs text-default-400 writing-mode-vertical">
            {t("chat")}
          </span>
        </div>
      </div>
    );
  }

  // Expanded state - full chat panel with resize handle
  return (
    <div
      className={clsx("h-full flex relative", className)}
      style={{ width: panelWidth }}
    >
      {/* Resize handle on the left edge */}
      <div
        className={clsx(
          "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group",
          "hover:bg-primary/20 active:bg-primary/30",
          isResizing && "bg-primary/30"
        )}
        onMouseDown={handleResizeStart}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-default-400" />
        </div>
      </div>

      <Card
        className="h-full flex-1 flex flex-col shadow-none border-l border-divider rounded-none"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2 shrink-0">
          <ChatHistorySelector
            compact
            activeChatId={activeChatId}
            onChatSelect={handleChatSelect}
            onNewChat={handleNewChat}
          />
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={handleToggleCollapse}
            title={t("collapseChat")}
          >
            <PanelRightClose size={20} />
          </Button>
        </CardHeader>
        
        <Divider />
        
        <CardBody className="flex-1 p-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {isLoadingChat ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-full"
              >
                <div className="text-default-400 text-sm">{t("loading")}</div>
              </motion.div>
            ) : (
              <motion.div
                key={activeChatId || "new"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <ChatInterface
                  chatId={activeChatId}
                  initialMessages={initialMessages}
                  disableActiveChatPersistence
                  onChatCreated={handleChatCreated}
                  compactMode
                  hideAvatars
                />
              </motion.div>
            )}
          </AnimatePresence>
        </CardBody>
      </Card>

      {/* Overlay to capture mouse events during resize */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
