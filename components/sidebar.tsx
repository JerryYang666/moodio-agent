"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  List,
  GalleryThumbnails,
  Trash2,
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
  viewMode: "list" | "grid";
}

const ChatItem = ({ chat, isActive, isCollapsed, viewMode }: ChatItemProps) => {
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

  const LinkComponent = (
    <NextLink
      href={`/chat/${chat.id}`}
      className={clsx(
        "transition-colors relative group/item",
        viewMode === "list" || isCollapsed
          ? "flex items-center gap-2 px-3 py-2 rounded-xl whitespace-nowrap text-sm"
          : "flex flex-col p-2 rounded-xl gap-2 h-auto",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-default-500 hover:bg-default-100 hover:text-default-900",
        isCollapsed && "justify-center pr-3"
      )}
    >
      {/* Grid View: Thumbnail */}
      {viewMode === "grid" && !isCollapsed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={clsx(
            "w-full rounded-lg overflow-hidden bg-default-100 relative border border-default-200",
            !thumbnailUrl && "aspect-square" // Only force square aspect ratio if no image
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

      {/* List View: Spinner only (no icon) */}
      {(viewMode === "list" || isCollapsed) && isMonitored && (
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

      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.span
            key={viewMode} // Triggers animation on view change
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={clsx(
              "overflow-hidden truncate text-sm",
              viewMode === "grid" ? "w-full text-center font-medium" : "flex-1"
            )}
          >
            {chatName}
          </motion.span>
        )}
      </AnimatePresence>

      {!isCollapsed && (
        <div
          className={clsx(
            "absolute opacity-0 group-hover/item:opacity-100 transition-opacity rounded-lg z-20",
            viewMode === "list"
              ? "right-2 top-1/2 -translate-y-1/2"
              : "top-2 right-2",
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
      )}
    </NextLink>
  );

  return (
    <motion.div layout className="relative group">
      {/* Rename Popover */}
      <Popover
        isOpen={isRenameOpen}
        onOpenChange={(open) => {
          setIsRenameOpen(open);
          if (!open) setNewName(chat.name || "");
        }}
        placement="right"
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
        placement="right"
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

      {/* Always show tooltip in List view if it has thumbnail, OR if collapsed */}
      {(viewMode === "list" || isCollapsed) && thumbnailUrl ? (
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
    </motion.div>
  );
};

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { chats, refreshChats } = useChat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  useEffect(() => {
    const handleRefreshChats = () => {
      refreshChats();
    };

    window.addEventListener("refresh-chats", handleRefreshChats);
    return () => {
      window.removeEventListener("refresh-chats", handleRefreshChats);
    };
  }, [refreshChats]);

  const handleNewChat = () => {
    window.dispatchEvent(new Event("reset-chat"));
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
      <div className="shrink-0">
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
                {t("nav.agent")}
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
            "flex flex-col gap-0 pb-0",
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
                  {t("chat.newChat")}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Divider with Switch */}
          {!isCollapsed && (
            <div className="relative py-2 flex items-center justify-center my-0">
              <div className="absolute inset-0 flex items-center">
                <Divider />
              </div>
              <div className="relative bg-background px-2 flex gap-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={clsx(
                    "p-1 rounded hover:bg-default-100 transition-colors",
                    viewMode === "list" ? "text-primary" : "text-default-400"
                  )}
                  title={t("nav.listView")}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={clsx(
                    "p-1 rounded hover:bg-default-100 transition-colors",
                    viewMode === "grid" ? "text-primary" : "text-default-400"
                  )}
                  title={t("nav.gridView")}
                >
                  <GalleryThumbnails size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={clsx(
          "flex flex-col gap-1 py-2 grow overflow-y-auto overflow-x-hidden sidebar-scrollbar",
          isCollapsed ? "px-2" : "pl-3 pr-2"
        )}
      >
        {/* Recent Chats */}
        {!isCollapsed && (
          <motion.div
            layout
            className={clsx(
              "space-y-1",
              viewMode === "grid" && !isCollapsed
                ? "grid grid-cols-1 gap-0 space-y-0"
                : ""
            )}
          >
            <AnimatePresence mode="popLayout">
              {chats.map((chat) => {
                const isActive = pathname === `/chat/${chat.id}`;
                return (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={isActive}
                    isCollapsed={isCollapsed}
                    viewMode={viewMode}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.aside>
  );
};
