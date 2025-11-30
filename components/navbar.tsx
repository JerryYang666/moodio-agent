"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
} from "@heroui/navbar";
import { Link } from "@heroui/link";
import { link as linkStyles } from "@heroui/theme";
import NextLink from "next/link";
import clsx from "clsx";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import {
  BotMessageSquare,
  Home,
  LayoutDashboard,
  Settings,
  User as UserIcon,
  Shield,
  SquarePen,
  MessageSquare,
  Folder,
  LogOut,
  Globe,
  Clapperboard,
  List,
  GalleryThumbnails,
  MoreHorizontal,
  Pencil,
  Check,
} from "lucide-react";
import { User } from "@heroui/user";
import { Avatar } from "@heroui/avatar";
import { Card, CardBody } from "@heroui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Button } from "@heroui/button";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { Divider } from "@heroui/divider";
import { Chat } from "@/components/chat-provider";
import { motion, AnimatePresence } from "framer-motion";
import { Spinner } from "@heroui/spinner";
import { Image } from "@heroui/image";
import { Input } from "@heroui/input";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  viewMode: "list" | "grid";
}

// Re-implementation of ChatItem for Mobile Navbar to handle interactions properly in mobile context
const MobileChatItem = ({ chat, isActive, viewMode }: ChatItemProps) => {
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

  return (
    <div className="relative group">
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

      <NextLink
        href={`/chat/${chat.id}`}
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
            "absolute opacity-100 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity rounded-lg z-20",
            viewMode === "list"
              ? "right-2 top-1/2 -translate-y-1/2"
              : "top-2 right-2",
            isActive || viewMode === "grid" // Always visible on mobile/active/grid for better UX
              ? "visible"
              : "hidden"
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
                Rename
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </NextLink>
    </div>
  );
};

export const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { chats, refreshChats } = useChat();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "browse" | "agent" | "collections" | "storyboard"
  >("agent");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    if (pathname?.startsWith("/browse")) setActiveSection("browse");
    else if (pathname?.startsWith("/collection"))
      setActiveSection("collections");
    else if (pathname?.startsWith("/storyboard"))
      setActiveSection("storyboard");
    else setActiveSection("agent");
  }, [pathname]);

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
    setIsMenuOpen(false);
  };

  const navTabs = [
    {
      id: "browse",
      label: "Browse",
      icon: <Globe size={20} />,
      href: "/browse",
    },
    {
      id: "agent",
      label: "Agent",
      icon: <BotMessageSquare size={20} />,
      href: "/chat",
    },
    {
      id: "collections",
      label: "Collect.",
      icon: <Folder size={20} />,
      href: "/collection",
    },
    {
      id: "storyboard",
      label: "Story.",
      icon: <Clapperboard size={20} />,
      href: "/storyboard",
    },
  ];

  return (
    <HeroUINavbar
      maxWidth="xl"
      position="sticky"
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
      classNames={{
        base: "md:h-auto h-12",
        wrapper: "md:px-6 px-3 md:h-auto h-12",
      }}
    >
      <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
        <NavbarBrand as="li" className="gap-2 max-w-fit">
          <NextLink className="flex justify-start items-center gap-1" href="/">
            <BotMessageSquare className="md:w-6 md:h-6 w-5 h-5" />
            <p className="font-bold text-inherit md:text-base text-sm">
              moodio agent
            </p>
          </NextLink>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden" justify="end">
        <NavbarItem className="hidden gap-2">
          <ThemeSwitch />
        </NavbarItem>
      </NavbarContent>

      <NavbarContent className="basis-1 md:pl-4 pl-2" justify="end">
        <NavbarMenuToggle className="md:w-auto md:h-auto w-8 h-8" />
      </NavbarContent>

      <NavbarMenu className="pt-0 mt-0 top-12 bottom-0 pb-0 h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        <div className="flex flex-col h-full pt-2 pb-4">
          {/* Top Tabs */}
          <div className="grid grid-cols-4 gap-1 px-2 mb-4 shrink-0">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSection(tab.id as any);
                  router.push(tab.href);
                  // Don't close menu immediately to allow interaction with sub-nav if needed
                  // But usually navigating changes page.
                  // For "Agent", we might want to stay open to pick a chat?
                  // Let's follow typical behavior: navigating usually closes, but here we are building navigation INSIDE the menu.
                  // If it's just a tab switch, we don't route yet? Or do we?
                  // The prompt says "switch between these sort of pages".
                  // If I click "Agent", I expect to see the chat list.
                }}
                className={clsx(
                  "flex flex-col items-center justify-center p-2 rounded-xl transition-colors gap-1",
                  activeSection === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-default-500 hover:bg-default-100"
                )}
              >
                {tab.icon}
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Dynamic Content Area based on activeSection */}
          <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-2 min-h-0">
            {activeSection === "agent" && (
              <>
                <div className="flex flex-col gap-0 pb-0 shrink-0 sticky top-0 bg-background z-10">
                  <button
                    onClick={handleNewChat}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100 hover:text-default-900 w-full justify-center bg-default-50 mb-2"
                  >
                    <SquarePen size={20} />
                    <span className="text-sm">New Chat</span>
                  </button>

                  <div className="relative py-2 flex items-center justify-center my-0">
                    <div className="absolute inset-0 flex items-center">
                      <Divider />
                    </div>
                    <div className="relative bg-background px-2 flex gap-1">
                      <button
                        onClick={() => setViewMode("list")}
                        className={clsx(
                          "p-1 rounded hover:bg-default-100 transition-colors",
                          viewMode === "list"
                            ? "text-primary"
                            : "text-default-400"
                        )}
                        title="List View"
                      >
                        <List size={16} />
                      </button>
                      <button
                        onClick={() => setViewMode("grid")}
                        className={clsx(
                          "p-1 rounded hover:bg-default-100 transition-colors",
                          viewMode === "grid"
                            ? "text-primary"
                            : "text-default-400"
                        )}
                        title="Grid View"
                      >
                        <GalleryThumbnails size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={clsx(
                    "pb-4",
                    viewMode === "grid"
                      ? "grid grid-cols-1 gap-2"
                      : "flex flex-col gap-1"
                  )}
                >
                  {chats.length > 0 ? (
                    chats.map((chat) => (
                      <div key={chat.id} onClick={() => setIsMenuOpen(false)}>
                        <MobileChatItem
                          chat={chat}
                          isActive={pathname === `/chat/${chat.id}`}
                          viewMode={viewMode}
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-default-400 py-4 text-sm">
                      No chats yet
                    </p>
                  )}
                </div>
              </>
            )}

            {activeSection === "collections" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Folder size={48} className="mb-2 opacity-50" />
                <p>Manage your collections here</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/collection");
                    setIsMenuOpen(false);
                  }}
                >
                  Go to Collections
                </Button>
              </div>
            )}

            {activeSection === "browse" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Globe size={48} className="mb-2 opacity-50" />
                <p>Browse content</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/browse");
                    setIsMenuOpen(false);
                  }}
                >
                  Go to Browse
                </Button>
              </div>
            )}

            {activeSection === "storyboard" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Clapperboard size={48} className="mb-2 opacity-50" />
                <p>Storyboard your ideas</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/storyboard");
                    setIsMenuOpen(false);
                  }}
                >
                  Go to Storyboard
                </Button>
              </div>
            )}
          </div>

          {/* User & Admin Section at Bottom */}
          <div className="mt-auto pt-2 px-4 pb-4 shrink-0 border-t border-divider">
            {user && (
              <div className="flex flex-col gap-2">
                {user.roles.includes("admin") && (
                  <NextLink
                    href="/admin"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100"
                  >
                    <Shield size={20} />
                    <span>Admin Dashboard</span>
                  </NextLink>
                )}

                <div className="flex items-center justify-between gap-2 bg-default-50 p-2 rounded-xl">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Avatar
                      src={undefined}
                      name={
                        user.firstName?.charAt(0) ||
                        user.email.charAt(0).toUpperCase()
                      }
                      size="sm"
                      isBordered
                      color="primary"
                    />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium truncate">
                        {user.firstName
                          ? `${user.firstName} ${user.lastName || ""}`
                          : user.email}
                      </span>
                      <span className="text-xs text-default-400 truncate">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <ThemeSwitch />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => {
                        logout();
                        setIsMenuOpen(false);
                      }}
                    >
                      <LogOut size={18} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </NavbarMenu>
    </HeroUINavbar>
  );
};
