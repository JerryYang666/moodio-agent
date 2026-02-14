"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarMenu,
  NavbarMenuToggle,
  NavbarBrand,
  NavbarItem,
} from "@heroui/navbar";
import NextLink from "next/link";
import clsx from "clsx";

import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import {
  BotMessageSquare,
  Shield,
  Folder,
  LogOut,
  Globe,
  Clapperboard,
  MoreHorizontal,
  Bean,
  User as UserIcon,
  PencilRuler,
} from "lucide-react";
import { Avatar } from "@heroui/avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Button } from "@heroui/button";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { useCredits } from "@/hooks/use-credits";
import { ChatHistorySelector } from "@/components/chat/chat-history-selector";
import { siteConfig } from "@/config/site";

export const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { refreshChats } = useChat();
  const { balance: credits } = useCredits();
  const t = useTranslations();
  const tCredits = useTranslations("credits");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "browse" | "agent" | "projects" | "storyboard"
  >("agent");

  useEffect(() => {
    if (pathname?.startsWith("/browse")) setActiveSection("browse");
    else if (
      pathname?.startsWith("/projects") ||
      pathname?.startsWith("/collection")
    )
      setActiveSection("projects");
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
      label: t("nav.browse"),
      icon: <Globe size={20} />,
      href: "/browse",
    },
    {
      id: "agent",
      label: t("nav.agent"),
      icon: <BotMessageSquare size={20} />,
      href: "/chat",
    },
    {
      id: "projects",
      label: t("nav.projects"),
      icon: <Folder size={20} />,
      href: "/projects",
    },
    {
      id: "storyboard",
      label: t("nav.storyboardShort"),
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
              {t("common.appName")}
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
          <div className="grid grid-cols-4 gap-1 px-2 mb-1 shrink-0">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSection(tab.id as any);
                  router.push(tab.href);
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 flex flex-col gap-2 min-h-0">
            {activeSection === "agent" && (
              <ChatHistorySelector
                onChatSelect={() => setIsMenuOpen(false)}
                onNewChat={handleNewChat}
                className="flex-1 pt-2"
              />
            )}

            {activeSection === "projects" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Folder size={48} className="mb-2 opacity-50" />
                <p>{t("projects.manageProjectsHere")}</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/projects");
                    setIsMenuOpen(false);
                  }}
                >
                  {t("projects.goToProjects")}
                </Button>
              </div>
            )}

            {activeSection === "browse" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Globe size={48} className="mb-2 opacity-50" />
                <p>{t("browse.subtitle")}</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/browse");
                    setIsMenuOpen(false);
                  }}
                >
                  {t("browse.goToBrowse")}
                </Button>
              </div>
            )}

            {activeSection === "storyboard" && (
              <div className="flex flex-col items-center justify-center h-full text-default-500">
                <Clapperboard size={48} className="mb-2 opacity-50" />
                <p>{t("storyboard.subtitle")}</p>
                <Button
                  className="mt-4"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    router.push("/storyboard");
                    setIsMenuOpen(false);
                  }}
                >
                  {t("storyboard.goToStoryboard")}
                </Button>
              </div>
            )}
          </div>

          {/* User & Admin Section at Bottom */}
          <div className="mt-auto pt-2 px-4 pb-16 shrink-0 border-t border-divider/50">
            {user && (
              <div className="flex flex-col gap-2">
                {(user.roles.includes("admin") ||
                  user.roles.includes("annotator")) && (
                  <a
                    href={siteConfig.annotationPlatformUrl}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100"
                  >
                    <PencilRuler size={20} />
                    <span>{t("nav.annotationPlatform")}</span>
                  </a>
                )}
                {user.roles.includes("admin") && (
                  <NextLink
                    href="/admin"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors text-default-500 hover:bg-default-100"
                  >
                    <Shield size={20} />
                    <span>{t("nav.adminDashboard")}</span>
                  </NextLink>
                )}

                <div className="flex items-center justify-between gap-2 bg-default-100/50 p-2 rounded-xl">
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <div className="shrink-0">
                      <Avatar
                        src={undefined}
                        name={
                          user.firstName?.charAt(0) ||
                          user.email.charAt(0).toUpperCase()
                        }
                        size="sm"
                        color="primary"
                      />
                    </div>
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
                  <Popover placement="top">
                    <PopoverTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        className="text-default-500"
                      >
                        <MoreHorizontal size={18} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <div className="flex flex-col gap-2 p-2 min-w-48">
                        {/* Credits */}
                        {credits !== null && (
                          <NextLink
                            href="/credits"
                            onClick={() => setIsMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-default-100"
                          >
                            <Bean size={16} className="text-primary" />
                            <span className="font-medium">{credits.toLocaleString()}</span>
                            <span className="text-default-400 text-sm">{tCredits("namePlural")}</span>
                          </NextLink>
                        )}
                        {/* Profile */}
                        <NextLink
                          href="/profile"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-default-100"
                        >
                          <UserIcon size={16} />
                          <span>{t("nav.profile")}</span>
                        </NextLink>
                        <div className="h-px bg-divider my-1" />
                        <div className="flex items-center justify-between gap-4 px-2">
                          <LanguageSwitch />
                          <ThemeSwitch />
                        </div>
                        <div className="h-px bg-divider my-1" />
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          startContent={<LogOut size={16} />}
                          className="w-full"
                          onPress={() => {
                            logout();
                            setIsMenuOpen(false);
                          }}
                        >
                          {t("nav.logout")}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </div>
      </NavbarMenu>
    </HeroUINavbar>
  );
};
