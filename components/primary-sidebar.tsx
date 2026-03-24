"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import {
  BotMessageSquare,
  Folder,
  Shield,
  LogOut,
  User as UserIcon,
  Users as UsersIcon,
  BookOpen,
  Bean,
  PencilRuler,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Video,
  Monitor,
  Check,
} from "lucide-react";
import { Avatar } from "@heroui/avatar";
import { Tooltip } from "@heroui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useCredits } from "@/hooks/use-credits";
import { useTeams } from "@/hooks/use-team";
import { useDispatch } from "react-redux";
import { setActiveAccountLocal, resetToPersonalLocal } from "@/lib/redux/slices/activeAccountSlice";
import { useSetActiveAccountMutation } from "@/lib/redux/services/next-api";
import { useFeatureFlag } from "@/lib/feature-flags";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@heroui/popover";
import { siteConfig } from "@/config/site";

export const PrimarySidebar = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { balance: credits, activeAccountType, activeTeamName, refreshBalance } = useCredits();
  const { teams } = useTeams();
  const dispatch = useDispatch();
  const [setActiveAccountApi] = useSetActiveAccountMutation();
  const t = useTranslations("nav");
  const tCredits = useTranslations("credits");
  const tLanguage = useTranslations("language");
  const showDesktop = useFeatureFlag<boolean>("user_desktop") ?? false;

  const STORAGE_KEY = "moodio:sidebar-collapsed";
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const navItems = [
    {
      label: t("inspiration"),
      href: "/browse",
      icon: <BookOpen size={20} />,
      isActive: (path: string) => path.startsWith("/browse"),
    },
    {
      label: t("generation"),
      href: "/chat",
      icon: <Sparkles size={20} />,
      isActive: (path: string) => path.startsWith("/chat"),
    },
    {
      label: t("video"),
      href: "/storyboard",
      icon: <Video size={20} />,
      isActive: (path: string) => path.startsWith("/storyboard"),
    },
    {
      label: t("assets"),
      href: "/projects",
      icon: <Folder size={20} />,
      isActive: (path: string) =>
        path.startsWith("/projects") || path.startsWith("/collection"),
    },
    ...(showDesktop
      ? [
          {
            label: t("canvas"),
            href: "/desktop",
            icon: <Monitor size={20} />,
            isActive: (path: string) => path.startsWith("/desktop"),
          },
        ]
      : []),
  ];

  return (
    <motion.aside
      layout
      className={clsx(
        "hidden md:flex flex-col h-screen sticky top-0 border-r border-divider bg-background z-50 items-center py-6 transition-[width] duration-300",
        collapsed ? "w-14" : "w-20"
      )}
    >
      {/* Logo */}
      <NextLink href="/" className="mb-4 shrink-0">
        <div className="bg-primary/10 p-2 rounded-xl transition-transform hover:scale-110">
          <BotMessageSquare className="text-primary" size={24} />
        </div>
      </NextLink>

      {/* Scrollable Navigation Items */}
      <div className="flex flex-col gap-1 w-full px-1 items-center flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
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
                  "py-2 px-1 rounded-xl transition-all duration-300 group relative z-0 flex flex-col items-center justify-center w-full",
                  !collapsed && "gap-0.5",
                  isActive
                    ? "text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-default-900"
                )}
              >
                {item.icon}
                {!collapsed && (
                  <span className="text-[10px] leading-tight font-medium truncate max-w-full">
                    {item.label}
                  </span>
                )}
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
        <div className="mt-auto flex flex-col gap-1 items-center w-full">
          {/* Annotation Platform Link */}
          {user &&
            (user.roles.includes("admin") ||
              user.roles.includes("annotator")) && (
              <Tooltip
                content={t("annotationPlatform")}
                placement="right"
                closeDelay={0}
              >
                <a
                  href={siteConfig.annotationPlatformUrl}
                  className={clsx(
                    "py-2 px-1 rounded-xl transition-all duration-300 group relative z-0 flex flex-col items-center justify-center w-full text-default-500 hover:bg-default-100 hover:text-default-900",
                    !collapsed && "gap-0.5"
                  )}
                >
                  <PencilRuler size={20} />
                  {!collapsed && (
                    <span className="text-[10px] leading-tight font-medium truncate max-w-full">
                      {t("annotationPlatform")}
                    </span>
                  )}
                </a>
              </Tooltip>
            )}

          {/* Admin Link */}
          {user && user.roles.includes("admin") && (
            <Tooltip content={t("admin")} placement="right" closeDelay={0}>
              <NextLink
                href="/admin"
                className={clsx(
                  "py-2 px-1 rounded-xl transition-all duration-300 group relative z-0 flex flex-col items-center justify-center w-full",
                  !collapsed && "gap-0.5",
                  pathname?.startsWith("/admin")
                    ? "text-primary"
                    : "text-default-500 hover:bg-default-100 hover:text-default-900"
                )}
              >
                <Shield size={20} />
                {!collapsed && (
                  <span className="text-[10px] leading-tight font-medium truncate max-w-full">
                    {t("admin")}
                  </span>
                )}
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

      {/* Bottom pinned section: Teams, Credits, Profile, Collapse */}
      <div className="shrink-0 flex flex-col items-center w-full">
        {/* Teams Link */}
        {user && (
          <Tooltip content={t("teams")} placement="right" closeDelay={0}>
            <NextLink
              href="/teams"
              className={clsx(
                "flex flex-col items-center gap-0.5 px-2 py-1.5 mt-2 rounded-xl transition-all duration-300 relative z-0",
                pathname?.startsWith("/teams")
                  ? "text-primary"
                  : "text-default-500 hover:bg-default-100 hover:text-default-900"
              )}
            >
              <UsersIcon size={18} />
              {!collapsed && (
                <span className="text-[10px] leading-tight font-medium truncate max-w-full">
                  {t("teams")}
                </span>
              )}
              {pathname?.startsWith("/teams") && (
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

      {/* Credits Display with Account Switcher */}
      {user && credits !== null && (
        <Popover placement="right" showArrow>
          <PopoverTrigger>
            <button
              className={clsx(
                "flex flex-col items-center gap-1 px-2 py-1.5 mt-1 rounded-xl transition-all duration-300 relative z-0 outline-none",
                pathname === "/credits"
                  ? "text-primary"
                  : "text-default-500 hover:bg-default-100 hover:text-default-900"
              )}
              onClick={refreshBalance}
            >
              <div className="relative">
                <Bean size={18} />
                {activeAccountType === "team" && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-secondary rounded-full" />
                )}
              </div>
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
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-default-400 px-3 py-1">{tCredits("billingHint")}</p>
              <button
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-colors",
                  activeAccountType === "personal"
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-default-100"
                )}
                onClick={() => {
                  dispatch(resetToPersonalLocal());
                  setActiveAccountApi({ accountType: "personal", accountId: null });
                }}
              >
                <Bean size={14} />
                <span className="flex-1">{tCredits("personal")}</span>
                {activeAccountType === "personal" && <Check size={14} className="text-primary" />}
              </button>
              {teams.map((team) => (
                <button
                  key={team.teamId}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-colors",
                    activeAccountType === "team" && activeTeamName === team.teamName
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-default-100"
                  )}
                  onClick={() => {
                    dispatch(
                      setActiveAccountLocal({
                        accountType: "team",
                        accountId: team.teamId,
                        teamName: team.teamName,
                      })
                    );
                    setActiveAccountApi({ accountType: "team", accountId: team.teamId });
                  }}
                >
                  <UsersIcon size={14} />
                  <span className="flex-1 truncate">{team.teamName}</span>
                  {activeAccountType === "team" && activeTeamName === team.teamName && <Check size={14} className="text-primary" />}
                </button>
              ))}
              <div className="h-px bg-divider my-1" />
              <NextLink
                href="/credits"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-default-100 text-default-500"
              >
                {tCredits("viewAll")}
              </NextLink>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* User Profile */}
      <div className="pt-2 pb-2 px-2 w-full flex flex-col items-center gap-3">
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

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="mt-2 p-1.5 rounded-lg text-default-400 hover:text-default-700 hover:bg-default-100 transition-colors"
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      </div>
    </motion.aside>
  );
};
