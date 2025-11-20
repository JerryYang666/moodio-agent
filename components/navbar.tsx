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
  NavbarMenuItem,
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
  MessageSquare
} from "lucide-react";
import { User } from "@heroui/user";
import { Card, CardBody } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { Divider } from "@heroui/divider";

interface Chat {
  id: string;
  name: string | null;
  updatedAt: string;
}

export const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
    setIsMenuOpen(false);
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
    <HeroUINavbar 
      maxWidth="xl" 
      position="sticky"
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
    >
      <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
        <NavbarBrand as="li" className="gap-3 max-w-fit">
          <NextLink className="flex justify-start items-center gap-1" href="/">
            <BotMessageSquare />
            <p className="font-bold text-inherit">moodio agent</p>
          </NextLink>
        </NavbarBrand>
        <ul className="hidden lg:flex gap-4 justify-start ml-2">
          {siteConfig.navItems.map((item) => (
            <NavbarItem key={item.href}>
              <NextLink
                className={clsx(
                  linkStyles({ color: "foreground" }),
                  "data-[active=true]:text-primary data-[active=true]:font-medium"
                )}
                color="foreground"
                href={item.href}
              >
                {item.label}
              </NextLink>
            </NavbarItem>
          ))}
        </ul>
      </NavbarContent>

      <NavbarContent
        className="hidden"
        justify="end"
      >
        <NavbarItem className="hidden gap-2">
          <ThemeSwitch />
        </NavbarItem>
      </NavbarContent>

      <NavbarContent className="basis-1 pl-4" justify="end">
        <ThemeSwitch />
        <NavbarMenuToggle />
      </NavbarContent>

      <NavbarMenu>
        <div className="mx-4 mt-2 flex flex-col gap-3 max-h-[calc(100vh-80px)] overflow-y-auto">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100 hover:text-default-900"
          >
            <SquarePen size={20} />
            <span className="text-sm">New Chat</span>
          </button>

          {/* Navigation Items */}
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <NextLink
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-default-500 hover:bg-default-100 hover:text-default-900"
                )}
              >
                {getIcon(item.label)}
                <span className="text-sm">{item.label}</span>
              </NextLink>
            );
          })}

          {/* Admin Link */}
          {user && user.roles.includes("admin") && (
            <NextLink
              href="/admin"
              onClick={() => setIsMenuOpen(false)}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors",
                pathname?.startsWith("/admin")
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-default-500 hover:bg-default-100 hover:text-default-900"
              )}
            >
              <Shield size={20} />
              <span className="text-sm">Admin</span>
            </NextLink>
          )}

          <Divider className="my-2" />

          {/* Recent Chats */}
          <div className="space-y-1">
            <p className="px-3 text-xs text-default-400 font-semibold uppercase">Recent Chats</p>
            {chats.length > 0 ? (
              chats.map((chat) => {
                const isActive = pathname === `/chat/${chat.id}`;
                const chatName = chat.name || "New Chat";
                
                return (
                  <NextLink
                    key={chat.id}
                    href={`/chat/${chat.id}`}
                    onClick={() => setIsMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-sm",
                      isActive 
                        ? "bg-primary/10 text-primary font-medium" 
                        : "text-default-500 hover:bg-default-100 hover:text-default-900"
                    )}
                  >
                    <MessageSquare size={16} />
                    <span className="truncate">{chatName}</span>
                  </NextLink>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-default-400">No recent chats</p>
            )}
          </div>

          <Divider className="my-2" />

          {/* User Profile */}
          {user && (
            <Card shadow="sm" className="bg-default-50 dark:bg-default-100/50">
              <CardBody className="p-2">
                <User
                  name={displayName}
                  description={user.email}
                  avatarProps={{
                    src: undefined,
                    name: user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase(),
                    isBordered: true,
                    color: "primary",
                    size: "sm",
                  }}
                  classNames={{
                    name: "text-sm font-semibold truncate",
                    description: "text-xs text-default-500 truncate",
                  }}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </NavbarMenu>
    </HeroUINavbar>
  );
};
