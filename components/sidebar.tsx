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
  LogOut
} from "lucide-react";
import { User } from "@heroui/user";
import { Card, CardBody } from "@heroui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@heroui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Divider } from "@heroui/divider";

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { chats, refreshChats } = useChat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);

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

      <div className="flex flex-col gap-1 pl-3 pr-2 py-2 grow overflow-y-auto overflow-x-hidden sidebar-scrollbar">
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
        
        <Divider className="my-2" />
        
        {/* Recent Chats */}
        <div className="space-y-1">
          {chats.map((chat) => {
             const isActive = pathname === `/chat/${chat.id}`;
             // Display name, default to "New Chat" if null, but NEVER show ID
             const chatName = chat.name || "New Chat";
             
             return (
              <NextLink
                key={chat.id}
                href={`/chat/${chat.id}`}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors whitespace-nowrap text-sm",
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-default-500 hover:bg-default-100 hover:text-default-900",
                  isCollapsed && "justify-center"
                )}
              >
                <span className="shrink-0"><MessageSquare size={16} /></span>
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
              </NextLink>
             )
          })}
        </div>
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
            <PopoverContent className="w-full">
              <div className="flex items-center justify-between gap-20 px-3 py-2 w-full">
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
                <div className="flex items-center">
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
