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
  MessageSquare
} from "lucide-react";
import { User } from "@heroui/user";
import { Card, CardBody } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@heroui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Divider } from "@heroui/divider";

interface Chat {
  id: string;
  name: string | null;
  updatedAt: string;
}

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);

  const fetchChats = async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      }
    } catch (error) {
      console.error("Failed to fetch chats", error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchChats();
    }
    
    // Listen for custom event to refresh chats
    const handleRefreshChats = () => {
      fetchChats();
    };
    
    window.addEventListener("refresh-chats", handleRefreshChats);
    return () => {
      window.removeEventListener("refresh-chats", handleRefreshChats);
    };
  }, [user, pathname]); 

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
      <div className={clsx("p-6 flex items-center gap-2", isCollapsed && "justify-center px-2")}>
        <BotMessageSquare className="text-primary shrink-0" size={24} />
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

      <div className="flex flex-col gap-1 px-3 py-2 grow overflow-y-auto overflow-x-hidden">
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

      <div className="p-3 border-t border-divider mt-auto space-y-4">
        {user && (
          <Card shadow="sm" className={clsx("bg-default-50 dark:bg-default-100/50", isCollapsed ? "p-1" : "")}>
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
        )}
        
        <div className={clsx("flex items-center px-2", isCollapsed ? "flex-col-reverse gap-4 justify-center" : "justify-between")}>
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={() => setIsCollapsed(!isCollapsed)}
            className="text-default-500"
          >
            {isCollapsed ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
          </Button>
          <ThemeSwitch />
        </div>
      </div>
    </motion.aside>
  );
};
