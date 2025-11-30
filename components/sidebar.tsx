"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import {
  PanelRightClose,
  PanelRightOpen,
  SquarePen,
  MessageSquare,
  Pencil,
  Check,
  MoreHorizontal,
} from "lucide-react";
import { Tooltip } from "@heroui/tooltip";
import { Image } from "@heroui/image";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Spinner } from "@heroui/spinner";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Divider } from "@heroui/divider";
import { Chat } from "@/components/chat-provider";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  isCollapsed: boolean;
}

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

const ChatItem = ({ chat, isActive, isCollapsed }: ChatItemProps) => {
  const { renameChat, isChatMonitored } = useChat();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newName, setNewName] = useState(chat.name || "");
  const [isRenaming, setIsRenaming] = useState(false);

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

  const chatName = chat.name || "New Chat";
  const isMonitored = isChatMonitored(chat.id);
  const thumbnailUrl = chat.thumbnailImageId
    ? `${AWS_S3_PUBLIC_URL}/${chat.thumbnailImageId}`
    : null;

  const LinkComponent = (
    <NextLink
      href={`/chat/${chat.id}`}
      className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap text-sm relative",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-default-500 hover:bg-default-100 hover:text-default-900",
        isCollapsed && "justify-center pr-3"
      )}
    >
      <span className="shrink-0 flex items-center justify-center w-4 h-4">
        {isMonitored ? (
          <Spinner
            size="sm"
            color="current"
            classNames={{
              wrapper: "w-4 h-4",
              circle1: "border-b-current",
              circle2: "border-b-current",
            }}
          />
        ) : (
          <MessageSquare size={16} />
        )}
      </span>
      <AnimatePresence>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="overflow-hidden truncate"
          >
            {chatName}
          </motion.span>
        )}
      </AnimatePresence>

      {!isCollapsed && (
        <div
          className={clsx(
            "absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg",
            isActive
              ? "bg-primary/20 backdrop-blur-md"
              : "bg-default-100/80 backdrop-blur-md"
          )}
        >
          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="min-w-6 w-6 h-6 p-0 text-default-500"
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
                Rename
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      )}
    </NextLink>
  );

  return (
    <div className="relative group">
      <Popover
        isOpen={isRenameOpen}
        onOpenChange={(open) => {
          setIsRenameOpen(open);
          if (!open) setNewName(chat.name || "");
        }}
        placement="right"
      >
        <PopoverTrigger>
          {/* Anchor for the popover - positioned at the end of the item */}
          <div className="absolute right-2 top-1/2 w-1 h-1 opacity-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent>
          <div className="px-1 py-2 w-64">
            <p className="text-small font-bold text-foreground mb-2">
              Rename Chat
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

      {thumbnailUrl ? (
        <Tooltip
          content={
            <Image
              src={thumbnailUrl}
              alt="Chat Thumbnail"
              width={200}
              className="object-contain rounded-lg"
            />
          }
          placement="right"
          showArrow={true}
          delay={200}
          className="p-0.5"
        >
          <div className="w-full">{LinkComponent}</div>
        </Tooltip>
      ) : (
        LinkComponent
      )}
    </div>
  );
};

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { chats, refreshChats } = useChat();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Listen for custom event to refresh chats
    const handleRefreshChats = () => {
      refreshChats();
    };

    window.addEventListener("refresh-chats", handleRefreshChats);
    return () => {
      window.removeEventListener("refresh-chats", handleRefreshChats);
    };
  }, [refreshChats]);

  const handleNewChat = () => {
    router.push("/chat");
  };

  return (
    <motion.aside
      initial={{ width: 256 }}
      animate={{ width: isCollapsed ? 80 : 256 }}
      transition={{
        duration: 0.3,
        type: "spring",
        stiffness: 200,
        damping: 25,
      }}
      className="hidden md:flex flex-col h-full border-r border-divider bg-background z-40 overflow-hidden"
    >
      <div
        className={clsx(
          "p-4 flex items-center",
          isCollapsed ? "justify-center" : "justify-between"
        )}
      >
        <AnimatePresence>
          {!isCollapsed && (
            <motion.p
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="font-bold text-lg whitespace-nowrap overflow-hidden"
            >
              Chats
            </motion.p>
          )}
        </AnimatePresence>

        <Button
          isIconOnly
          variant="light"
          size="sm"
          onPress={() => setIsCollapsed(!isCollapsed)}
          className="text-default-500 shrink-0"
        >
          {isCollapsed ? (
            <PanelRightClose size={20} />
          ) : (
            <PanelRightOpen size={20} />
          )}
        </Button>
      </div>

      <div
        className={clsx(
          "flex flex-col gap-1 py-2 grow overflow-y-auto overflow-x-hidden sidebar-scrollbar",
          isCollapsed ? "px-2" : "pl-3 pr-2"
        )}
      >
        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className={clsx(
            "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap text-default-500 hover:bg-default-100 hover:text-default-900",
            isCollapsed && "justify-center"
          )}
        >
          <span className="shrink-0">
            <SquarePen size={20} />
          </span>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden text-sm"
              >
                New Chat
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <Divider className="my-2" />

        {/* Recent Chats */}
        <div className="space-y-1">
          {chats.map((chat) => {
            const isActive = pathname === `/chat/${chat.id}`;
            return (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={isActive}
                isCollapsed={isCollapsed}
              />
            );
          })}
        </div>
      </div>
    </motion.aside>
  );
};
