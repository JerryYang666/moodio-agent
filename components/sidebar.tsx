"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { 
  BotMessageSquare, 
  PanelRightClose, 
  PanelRightOpen, 
  Home,
  LayoutDashboard,
  Settings,
  User as UserIcon,
  Shield,
  SquarePen,
  MessageSquare,
  LogOut,
  Pencil,
  Check,
  MoreHorizontal,
  Folder,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { User } from "@heroui/user";
import { Card, CardBody } from "@heroui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Spinner } from "@heroui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { useCollections } from "@/hooks/use-collections";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Divider } from "@heroui/divider";
import { Chat } from "@/components/chat-provider";

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  isCollapsed: boolean;
}

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
            <p className="text-small font-bold text-foreground mb-2">Rename Chat</p>
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
          "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap text-sm relative",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-default-500 hover:bg-default-100 hover:text-default-900",
          isCollapsed && "justify-center pr-3"
        )}
      >
        <span className="shrink-0 flex items-center justify-center w-4 h-4">
          {isMonitored ? (
            <Spinner size="sm" color="current" classNames={{ wrapper: "w-4 h-4", circle1: "border-b-current", circle2: "border-b-current" }} />
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
          <div className={clsx(
            "absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg",
            isActive ? "bg-primary/20 backdrop-blur-md" : "bg-default-100/80 backdrop-blur-md"
          )}>
             <Dropdown>
               <DropdownTrigger>
                 <Button
                   isIconOnly
                   size="sm"
                   variant="light"
                   className="min-w-6 w-6 h-6 p-0 text-default-500"
                   onPress={(e) => {
                     // Prevent navigation
                     // Note: NextLink might still capture click if we are not careful, 
                     // but Button inside usually handles its own events.
                     // We might need to use e.continuePropagation() equivalent or just rely on button behavior.
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
    </div>
  );
};

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { chats, refreshChats } = useChat();
  const { collections } = useCollections();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isCollectionsExpanded, setIsCollectionsExpanded] = useState(false);

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

  const displayName = user
    ? (user.firstName && user.lastName)
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email
    : "";

  // Helper to get icon based on label
  const getIcon = (label: string) => {
    switch (label.toLowerCase()) {
      case "home":
        return <Home size={20} />;
      case "dashboard":
        return <LayoutDashboard size={20} />;
      case "settings":
        return <Settings size={20} />;
      case "profile":
        return <UserIcon size={20} />;
      case "admin":
        return <Shield size={20} />;
      default:
        return <BotMessageSquare size={20} />;
    }
  };

  // Filter out "Home" from navItems as we have "New Chat"
  const navItems = siteConfig.navItems.filter(item => item.label !== "Home");

  return (
    <motion.aside 
      initial={{ width: 256 }}
      animate={{ width: isCollapsed ? 80 : 256 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 25 }}
      className="hidden md:flex flex-col h-screen sticky top-0 border-r border-divider bg-background z-40 overflow-hidden"
    >
      <div className={clsx("p-4 flex items-center", isCollapsed ? "justify-center" : "justify-between")}>
        <div 
          className={clsx("flex items-center gap-2", isCollapsed && "cursor-pointer")}
          onMouseEnter={() => isCollapsed && setIsLogoHovered(true)}
          onMouseLeave={() => isCollapsed && setIsLogoHovered(false)}
          onClick={() => isCollapsed && setIsCollapsed(false)}
        >
          {isCollapsed && isLogoHovered ? (
            <PanelRightClose className="text-default-500 shrink-0" size={24} />
          ) : (
            <BotMessageSquare className="text-primary shrink-0" size={24} />
          )}
          <AnimatePresence>
            {!isCollapsed && (
              <motion.p 
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-bold text-inherit whitespace-nowrap overflow-hidden"
              >
                moodio agent
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {!isCollapsed && (
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={() => setIsCollapsed(!isCollapsed)}
            className="text-default-500 shrink-0"
          >
            <PanelRightOpen size={20} />
          </Button>
        )}
      </div>

      <div className={clsx("flex flex-col gap-1 py-2 grow overflow-y-auto overflow-x-hidden sidebar-scrollbar", isCollapsed ? "px-2" : "pl-3 pr-2")}>
        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className={clsx(
            "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap text-default-500 hover:bg-default-100 hover:text-default-900",
            isCollapsed && "justify-center"
          )}
        >
          <span className="shrink-0"><SquarePen size={20} /></span>
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

        {/* Collections Button */}
        <div className="relative" id="collections-button">
          <div
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap",
              pathname?.startsWith("/collection")
                ? "bg-primary/10 text-primary font-medium"
                : "text-default-500 hover:bg-default-100 hover:text-default-900",
              isCollapsed && "justify-center"
            )}
          >
            <button
              onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
              className="shrink-0 flex items-center"
            >
              <Folder size={20} />
            </button>
            <AnimatePresence>
              {!isCollapsed && (
                <>
                  <motion.button
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    onClick={() => router.push("/collection")}
                    className="overflow-hidden text-sm flex-1 text-left"
                  >
                    Collections
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
                    className="shrink-0"
                  >
                    {isCollectionsExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </motion.button>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Collections Dropdown */}
          {!isCollapsed && isCollectionsExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="ml-6 mt-1 space-y-1"
            >
              {collections.length === 0 ? (
                <div className="px-3 py-2 text-xs text-default-400">
                  No collections yet
                </div>
              ) : (
                collections.map((collection) => (
                  <NextLink
                    key={collection.id}
                    href={`/collection/${collection.id}`}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs",
                      pathname === `/collection/${collection.id}`
                        ? "bg-primary/10 text-primary"
                        : "text-default-500 hover:bg-default-100 hover:text-default-900"
                    )}
                  >
                    <Folder size={14} className="shrink-0" />
                    <span className="truncate">{collection.name}</span>
                  </NextLink>
                ))
              )}
            </motion.div>
          )}
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <NextLink
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap",
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-default-500 hover:bg-default-100 hover:text-default-900",
                isCollapsed && "justify-center"
              )}
            >
              <span className="shrink-0">{getIcon(item.label)}</span>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden text-sm"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NextLink>
          );
        })}

        {/* Admin Link */}
        {user && user.roles.includes("admin") && (
          <NextLink
            href="/admin"
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap",
              pathname?.startsWith("/admin")
                ? "bg-primary/10 text-primary font-medium" 
                : "text-default-500 hover:bg-default-100 hover:text-default-900",
              isCollapsed && "justify-center"
            )}
          >
            <span className="shrink-0"><Shield size={20} /></span>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden text-sm"
                >
                  Admin
                </motion.span>
              )}
            </AnimatePresence>
          </NextLink>
        )}
        
        {!isCollapsed && (
          <>
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
          </>
        )}
      </div>

      <div className="p-3 border-t border-divider mt-auto">
        {user && (
          <Popover placement="top" showArrow>
            <PopoverTrigger>
              <Card 
                isPressable 
                shadow="sm" 
                className={clsx("bg-default-50 dark:bg-default-100/50 cursor-pointer hover:bg-default-100 transition-colors w-full", isCollapsed ? "p-1" : "")}
              >
                <CardBody className={clsx("p-2 overflow-hidden", isCollapsed && "flex justify-center items-center")}>
                  <User
                    name={!isCollapsed ? displayName : ""}
                    description={!isCollapsed ? user.email : ""}
                    avatarProps={{
                      src: undefined,
                      name: user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase(),
                      isBordered: true,
                      color: "primary",
                      size: "sm",
                      className: "shrink-0"
                    }}
                    classNames={{
                      name: "text-sm font-semibold truncate",
                      description: "text-xs text-default-500 truncate",
                      base: isCollapsed ? "gap-0" : ""
                    }}
                  />
                </CardBody>
              </Card>
            </PopoverTrigger>
            <PopoverContent className="w-full p-2">
              <div className="flex flex-col gap-2 w-full min-w-[180px]">
                <NextLink href="/profile" className="w-full mb-2">
                  <Button
                    size="sm"
                    variant="flat"
                    className="w-full justify-start"
                    startContent={<UserIcon size={16} />}
                  >
                    Profile
                  </Button>
                </NextLink>
                <div className="flex items-center justify-between gap-12">
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    startContent={<LogOut size={16} />}
                    onPress={logout}
                    className="flex-1"
                  >
                    Logout
                  </Button>
                  <ThemeSwitch />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </motion.aside>
  );
};
