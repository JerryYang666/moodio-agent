"use client";

import React from "react";
import { usePathname } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import {
  BotMessageSquare,
  Folder,
  Shield,
  Clapperboard,
  LogOut,
  User as UserIcon,
  BookOpen,
  Bean,
  PencilRuler,
} from "lucide-react";
import { Avatar } from "@heroui/avatar";
import { Tooltip } from "@heroui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useCredits } from "@/hooks/use-credits";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@heroui/popover";

export const PrimarySidebar = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { balance: credits } = useCredits();
  const t = useTranslations("nav");
  const tCredits = useTranslations("credits");
  const tLanguage = useTranslations("language");

  const navItems = [
    {
      label: t("browse"),
      href: "/browse",
      icon: <BookOpen size={20} />,
    },
    {
      label: t("agent"),
      href: "/chat",
      icon: <BotMessageSquare size={20} />,
      isActive: (path: string) => path.startsWith("/chat") || path === "/",
    },
    {
      label: t("projects"),
      href: "/projects",
      icon: <Folder size={20} />,
      isActive: (path: string) =>
        path.startsWith("/projects") || path.startsWith("/collection"),
    },
    {
      label: t("storyboard"),
      href: "/storyboard",
      icon: <Clapperboard size={20} />,
    },
  ];

  return (
    <motion.aside
      layout
      className="hidden md:flex flex-col h-screen sticky top-0 border-r border-divider bg-background z-50 w-16 items-center py-6"
    >
      {/* Logo */}
      <div className="mb-8">
        <div className="bg-primary/10 p-2 rounded-xl">
          <BotMessageSquare className="text-primary" size={24} />
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex flex-col gap-4 w-full px-2 items-center flex-1">
        {navItems.map((item) => {
          const isActive = item.isActive
            ? item.isActive(pathname || "")
            : pathname === item.href;

          return (
            <Tooltip
              key={item.href}
              content={item.label}
              placement="right"
              closeDelay={0}
            >
              <NextLink
                href={item.href}
                className={clsx(
                  "p-2 rounded-xl transition-all duration-300 group relative z-0 flex items-center justify-center",
                  isActive
                    ? "text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-default-900"
                )}
              >
                {item.icon}
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl -z-10 shadow-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </NextLink>
            </Tooltip>
          );
        })}

        {/* Annotation Platform & Admin Links */}
        <div className="mt-auto flex flex-col gap-2 items-center">
          {/* Annotation Platform Link */}
          {user &&
            (user.roles.includes("admin") ||
              user.roles.includes("annotator")) && (
              <Tooltip
                content={t("annotationPlatform")}
                placement="right"
                closeDelay={0}
              >
                <NextLink
                  href="/api/auth/annotation-redirect"
                  className="p-2 rounded-xl transition-all duration-300 group relative z-0 flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-900"
                >
                  <PencilRuler size={20} />
                </NextLink>
              </Tooltip>
            )}

          {/* Admin Link */}
          {user && user.roles.includes("admin") && (
            <Tooltip content={t("admin")} placement="right" closeDelay={0}>
              <NextLink
                href="/admin"
                className={clsx(
                  "p-2 rounded-xl transition-all duration-300 group relative z-0 flex items-center justify-center",
                  pathname?.startsWith("/admin")
                    ? "text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-default-900"
                )}
              >
                <Shield size={20} />
                {pathname?.startsWith("/admin") && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute inset-0 bg-primary/10 rounded-xl -z-10 shadow-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </NextLink>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Credits Display */}
      {user && credits !== null && (
        <Tooltip
          content={tCredits("balance", { count: credits })}
          placement="right"
          closeDelay={0}
        >
          <NextLink
            href="/credits"
            className={clsx(
              "flex flex-col items-center gap-1 px-2 py-1.5 mt-4 rounded-xl transition-all duration-300 relative z-0",
              pathname === "/credits"
                ? "text-primary"
                : "text-default-500 hover:bg-default-100 hover:text-default-900"
            )}
          >
            <Bean size={18} />
            <span className="text-xs font-medium">{credits}</span>
            {pathname === "/credits" && (
              <motion.div
                layoutId="active-indicator"
                className="absolute inset-0 bg-primary/10 rounded-xl -z-10 shadow-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            )}
          </NextLink>
        </Tooltip>
      )}

      {/* User Profile */}
      <div className="mt-auto pt-4 pb-2 px-2 w-full flex flex-col items-center gap-4">
        <Tooltip content={tLanguage("switchLanguage")} placement="right" closeDelay={0}>
          <div>
            <LanguageSwitch />
          </div>
        </Tooltip>
        <ThemeSwitch />

        {user && (
          <Popover placement="right">
            <PopoverTrigger>
              <button className="outline-none flex justify-center w-full">
                <Avatar
                  src={undefined}
                  name={
                    user.firstName?.charAt(0) ||
                    user.email.charAt(0).toUpperCase()
                  }
                  isBordered
                  color="primary"
                  size="sm"
                  className="cursor-pointer hover:scale-110 transition-transform"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2">
              <div className="px-2 py-1">
                <p className="font-bold text-small truncate">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.firstName || user.email}
                </p>
                <p className="text-tiny text-default-500 truncate">{user.email}</p>
              </div>
              <div className="h-px bg-divider my-2" />
              <div className="flex flex-col gap-2">
                <NextLink href="/profile" className="w-full">
                  <Button
                    size="sm"
                    variant="flat"
                    className="w-full justify-start"
                    startContent={<UserIcon size={16} />}
                  >
                    {t("profile")}
                  </Button>
                </NextLink>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  startContent={<LogOut size={16} />}
                  onPress={logout}
                  className="w-full justify-start"
                >
                  {t("logout")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </motion.aside>
  );
};
