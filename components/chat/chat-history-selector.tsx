"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import clsx from "clsx";
import { motion } from "framer-motion";

import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Image } from "@heroui/image";
import { Input } from "@heroui/input";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import {
  MessageSquare,
  List,
  GalleryThumbnails,
  MoreHorizontal,
  Pencil,
  Check,
  Trash2,
  SquarePen,
  ChevronDown,
} from "lucide-react";

import { useChat } from "@/hooks/use-chat";
import { Chat } from "@/components/chat-provider";

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  viewMode: "list" | "grid";
  onSelect?: () => void;
}

/**
 * Individual chat item component with rename/delete actions
 */
export const ChatItem = ({ chat, isActive, viewMode, onSelect }: ChatItemProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("chat");
  const tCommon = useTranslations("common");
  const { renameChat, deleteChat, isChatMonitored } = useChat();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(chat.name || "");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRename = async () => {
    if (!newName.trim()) return;
    setIsRenaming(true);
    try {
      await renameChat(chat.id, newName);
      setIsRenameOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteChat(chat.id);
      setIsDeleteOpen(false);
      // If we're on the deleted chat's page, redirect to /chat
      if (pathname === `/chat/${chat.id}`) {
        router.push("/chat");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const chatName = chat.name || t("newChat");
  const isMonitored = isChatMonitored(chat.id);
  // Use CloudFront URL from API response (access via signed cookies)
  const thumbnailUrl = chat.thumbnailImageUrl || null;

  return (
    <div className="relative group">
      {/* Rename Popover */}
      <Popover
        isOpen={isRenameOpen}
        onOpenChange={(open) => {
          setIsRenameOpen(open);
          if (!open) setNewName(chat.name || "");
        }}
        placement="bottom"
      >
        <PopoverTrigger>
          <div className="absolute right-2 top-1/2 w-1 h-1 opacity-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent>
          <div className="px-1 py-2 w-64">
            <p className="text-small font-bold text-foreground mb-2">
              {t("renameChat")}
            </p>
            <div className="flex gap-2">
              <Input
                size="sm"
                value={newName}
                onValueChange={setNewName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                }}
                autoFocus
              />
              <Button
                size="sm"
                color="primary"
                isIconOnly
                isLoading={isRenaming}
                onPress={handleRename}
              >
                <Check size={16} />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete Confirmation Popover */}
      <Popover
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        placement="bottom"
      >
        <PopoverTrigger>
          <div className="absolute right-2 top-1/2 w-1 h-1 opacity-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent>
          <div className="px-1 py-2 w-64">
            <p className="text-small font-bold text-foreground mb-1">
              {t("deleteChat")}
            </p>
            <p className="text-tiny text-default-500 mb-3">
              {t("deleteConfirm")}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="flat"
                onPress={() => setIsDeleteOpen(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                color="danger"
                isLoading={isDeleting}
                onPress={handleDelete}
              >
                {tCommon("delete")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <NextLink
        href={`/chat/${chat.id}`}
        onClick={onSelect}
        className={clsx(
          "transition-colors relative group/item w-full",
          viewMode === "list"
            ? "flex items-center gap-2 px-3 py-2 rounded-xl whitespace-nowrap text-sm"
            : "flex flex-col p-2 rounded-xl gap-2 h-auto",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-default-500 hover:bg-default-100 hover:text-default-900"
        )}
      >
        {/* Grid View: Thumbnail */}
        {viewMode === "grid" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={clsx(
              "w-full rounded-lg overflow-hidden bg-default-100 relative border border-default-200",
              !thumbnailUrl && "aspect-square"
            )}
          >
            {thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={chatName}
                width={300}
                radius="none"
                classNames={{
                  wrapper: "w-full !max-w-full",
                  img: "w-full h-auto",
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-default-300">
                <MessageSquare size={24} />
              </div>
            )}
            {isMonitored && (
              <div className="absolute top-2 right-2 z-10">
                <Spinner
                  size="sm"
                  color="current"
                  classNames={{
                    wrapper: "w-4 h-4",
                    circle1: "border-b-current",
                    circle2: "border-b-current",
                  }}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* List View: Spinner */}
        {viewMode === "list" && isMonitored && (
          <span className="shrink-0 flex items-center justify-center w-4 h-4">
            <Spinner
              size="sm"
              color="current"
              classNames={{
                wrapper: "w-4 h-4",
                circle1: "border-b-current",
                circle2: "border-b-current",
              }}
            />
          </span>
        )}

        <span
          className={clsx(
            "overflow-hidden truncate text-sm",
            viewMode === "grid" ? "w-full text-center font-medium" : "flex-1"
          )}
        >
          {chatName}
        </span>

        <div
          className={clsx(
            "absolute opacity-100 transition-opacity rounded-lg z-20",
            viewMode === "list"
              ? "right-2 top-1/2 -translate-y-1/2"
              : "top-2 right-2"
          )}
        >
          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className={clsx(
                  "min-w-6 w-6 h-6 p-0",
                  viewMode === "grid"
                    ? "bg-background/50 backdrop-blur-sm text-foreground"
                    : "text-default-500"
                )}
                onPress={(e) => {
                  // Prevent navigation
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Chat Actions">
              <DropdownItem
                key="rename"
                startContent={<Pencil size={16} />}
                onPress={() => setIsRenameOpen(true)}
              >
                {tCommon("rename")}
              </DropdownItem>
              <DropdownItem
                key="delete"
                startContent={<Trash2 size={16} />}
                className="text-danger"
                color="danger"
                onPress={() => setIsDeleteOpen(true)}
              >
                {tCommon("delete")}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </NextLink>
    </div>
  );
};

export interface ChatHistorySelectorProps {
  /** Currently active chat ID */
  activeChatId?: string;
  /** Callback when a chat is selected */
  onChatSelect?: (chatId: string) => void;
  /** Callback when new chat is requested */
  onNewChat?: () => void;
  /** Compact mode for side panel use - shows dropdown instead of full list */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Chat history selector component that can be used in different contexts:
 * - Full mode: Shows new chat button, view mode toggle, and scrollable chat list
 * - Compact mode: Shows dropdown selector with new chat button
 */
export const ChatHistorySelector = ({
  activeChatId,
  onChatSelect,
  onNewChat,
  compact = false,
  className,
}: ChatHistorySelectorProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("chat");
  const tNav = useTranslations("nav");
  const { chats } = useChat();
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
    } else {
      router.push("/chat");
    }
  };

  const handleChatSelect = (chatId: string) => {
    if (onChatSelect) {
      onChatSelect(chatId);
    }
  };

  // Determine active chat ID from props or pathname
  const currentActiveChatId = activeChatId || 
    (pathname?.startsWith("/chat/") ? pathname.split("/chat/")[1] : undefined);

  // Find active chat for compact mode display
  const activeChat = chats.find((c) => c.id === currentActiveChatId);
  const activeChatName = activeChat?.name || t("newChat");

  if (compact) {
    // Compact mode: Dropdown selector
    return (
      <div className={clsx("flex items-center gap-2", className)}>
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="flat"
              size="sm"
              className="max-w-[180px] justify-between"
              endContent={<ChevronDown size={14} />}
            >
              <span className="truncate">{activeChatName}</span>
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Select Chat"
            selectionMode="single"
            selectedKeys={currentActiveChatId ? [currentActiveChatId] : []}
            onSelectionChange={(keys) => {
              const selectedId = Array.from(keys)[0] as string;
              if (selectedId) {
                handleChatSelect(selectedId);
                // Only navigate if no onChatSelect callback (side panel handles its own state)
                if (!onChatSelect) {
                  router.push(`/chat/${selectedId}`);
                }
              }
            }}
            className="max-h-[300px] overflow-auto"
          >
            {chats.map((chat) => (
              <DropdownItem key={chat.id} textValue={chat.name || t("newChat")}>
                <span className="truncate">{chat.name || t("newChat")}</span>
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          size="sm"
          variant="flat"
          onPress={handleNewChat}
          title={t("newChat")}
        >
          <SquarePen size={16} />
        </Button>
      </div>
    );
  }

  // Full mode: List with view toggle
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      {/* Header with New Chat and View Toggle */}
      <div className="flex flex-col gap-0 shrink-0">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100/80 hover:text-default-900 w-full justify-center bg-default-100/50 mb-2"
        >
          <SquarePen size={20} />
          <span className="text-sm">{t("newChat")}</span>
        </button>

        <div className="relative py-0 flex items-center justify-center my-0">
          <div className="relative px-2 flex gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={clsx(
                "p-1 rounded hover:bg-default-100 transition-colors",
                viewMode === "list" ? "text-primary" : "text-default-400"
              )}
              title={tNav("listView")}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={clsx(
                "p-1 rounded hover:bg-default-100 transition-colors",
                viewMode === "grid" ? "text-primary" : "text-default-400"
              )}
              title={tNav("gridView")}
            >
              <GalleryThumbnails size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Chat List */}
      <div
        className={clsx(
          "flex-1 overflow-y-auto",
          viewMode === "grid" ? "grid grid-cols-1 gap-2" : "flex flex-col gap-1"
        )}
      >
        {chats.length > 0 ? (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === currentActiveChatId}
              viewMode={viewMode}
              onSelect={() => handleChatSelect(chat.id)}
            />
          ))
        ) : (
          <p className="text-center text-default-400 py-4 text-sm">
            {t("noChatsYet")}
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatHistorySelector;
