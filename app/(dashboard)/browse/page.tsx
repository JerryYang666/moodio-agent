"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { useFeatureFlag } from "@/lib/feature-flags";
import { useSubscription } from "@/hooks/use-subscription";
import FilterMenu from "@/components/browse/FilterMenu";
import SearchBar from "@/components/browse/SearchBar";
import Breadcrumb from "@/components/browse/Breadcrumb";
import VideoGrid from "@/components/browse/VideoGrid";
import SubscriptionPaywall from "@/components/browse/SubscriptionPaywall";
import ChatSidePanel from "@/components/chat/chat-side-panel";
import { siteConfig } from "@/config/site";
import { SlidersHorizontal, Filter } from "lucide-react";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
} from "@heroui/drawer";
import { api } from "@/lib/api/client";
import type { RootState } from "@/lib/redux/store";

const DEFAULT_CHAT_PANEL_WIDTH = 380;
const COLLAPSED_CHAT_WIDTH = 48;

// Disable body-level scrolling on this page to prevent double scrollbars
// The VirtualInfiniteScroll component handles all scrolling for the video grid
const useDisableBodyScroll = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [enabled]);
};

export default function BrowsePage() {
  const t = useTranslations("browse");
  const searchParams = useSearchParams();
  const showBrowse = useFeatureFlag<boolean>("user_retrieval") ?? false;
  const { hasSubscription, loading: subLoading, refresh: refreshSub } = useSubscription();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  const checkoutHandled = useRef(false);

  useEffect(() => {
    if (checkoutHandled.current) return;
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      checkoutHandled.current = true;
      addToast({ title: t("paywall.checkoutSuccess"), color: "success" });
      refreshSub();
      window.history.replaceState(null, "", window.location.pathname);
    } else if (checkout === "canceled") {
      checkoutHandled.current = true;
      addToast({ title: t("paywall.checkoutCanceled"), color: "warning" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams, t, refreshSub]);

  // Manage subscription handler
  const handleManageSubscription = async () => {
    try {
      const { url } = await api.post("/api/stripe/portal");
      if (url) window.location.href = url;
    } catch { /* noop */ }
  };

  // Chat panel state — mirrors the pattern from storyboard page
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(siteConfig.chatPanelCollapsed) === "true";
  });

  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_PANEL_WIDTH;
    const stored = localStorage.getItem(siteConfig.chatPanelWidth);
    return stored ? parseInt(stored, 10) : DEFAULT_CHAT_PANEL_WIDTH;
  });

  const handleChatPanelCollapseChange = useCallback((collapsed: boolean) => {
    setIsChatPanelCollapsed(collapsed);
    localStorage.setItem(siteConfig.chatPanelCollapsed, String(collapsed));
  }, []);

  const handleChatPanelWidthChange = useCallback((width: number) => {
    setChatPanelWidth(width);
  }, []);

  const chatPanelActualWidth = isChatPanelCollapsed ? COLLAPSED_CHAT_WIDTH : chatPanelWidth;

  const selectedFilters = useSelector(
    (state: RootState) => state.query.selectedFilters
  );
  const contentTypes = useSelector(
    (state: RootState) => state.query.contentTypes
  );
  const isAigc = useSelector((state: RootState) => state.query.isAigc);

  // Count all active filters (taxonomy filters + content type + AI source)
  const activeFilterCount =
    selectedFilters.length +
    contentTypes.length +
    (isAigc !== undefined ? 1 : 0);

  // Only disable body scroll when the full browse UI is active
  useDisableBodyScroll(showBrowse && hasSubscription);

  if (!showBrowse) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-default-500">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p>{t("comingSoon")}</p>
      </div>
    );
  }

  if (subLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!hasSubscription) {
    return <SubscriptionPaywall />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar filter — full height, collapsible, hidden on mobile */}
      <div
        className={`shrink-0 hidden lg:flex flex-col transition-[width] duration-300 ease-in-out overflow-hidden border-r border-divider ${
          isFilterCollapsed ? "w-0 border-r-0" : "w-64"
        }`}
      >
        <div className="w-64 h-full flex flex-col px-4 py-6">
          <div className="flex items-center mb-3">
            <span className="text-sm font-semibold text-default-600">{t("filters")}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FilterMenu />
          </div>
        </div>
      </div>

      {/* Main browse content */}
      <main className="flex-1 px-4 py-6 min-w-0 flex flex-col overflow-hidden">
          <div className="mb-6 shrink-0 flex gap-2 items-start">
            {/* Desktop filter toggle button — visible only on lg+ */}
            <Button
              isIconOnly
              variant="bordered"
              size="lg"
              className="hidden lg:flex shrink-0"
              aria-label={isFilterCollapsed ? "Expand filters" : "Collapse filters"}
              onPress={() => setIsFilterCollapsed((v) => !v)}
            >
              <Badge
                content={activeFilterCount}
                color="primary"
                size="sm"
                isInvisible={activeFilterCount === 0}
                placement="top-right"
              >
                <Filter size={18} />
              </Badge>
            </Button>

            <SearchBar
              placeholder={t("searchPlaceholder")}
              className="flex-1 min-w-0"
            />

            <Button
              variant="flat"
              size="sm"
              className="hidden lg:flex shrink-0 text-xs"
              onPress={handleManageSubscription}
            >
              {t("manageSubscription")}
            </Button>

            {/* Mobile filter trigger button — visible only below lg breakpoint */}
            <Button
              isIconOnly
              variant="bordered"
              size="lg"
              className="lg:hidden shrink-0"
              aria-label={t("filters")}
              onPress={() => setIsFilterDrawerOpen(true)}
            >
              <Badge
                content={activeFilterCount}
                color="primary"
                size="sm"
                isInvisible={activeFilterCount === 0}
                placement="top-right"
              >
                <SlidersHorizontal size={18} />
              </Badge>
            </Button>
          </div>

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="shrink-0">
                <Breadcrumb />
              </div>

              <VideoGrid />
            </div>
          </div>
        </main>

        {/* Right Panel — Agent Chat (desktop only, always on top) */}
        <div
          className="hidden lg:block shrink-0 min-h-0 z-60"
          style={{
            width: chatPanelActualWidth,
            transition: isChatPanelCollapsed ? "width 0.3s ease-in-out" : undefined,
          }}
        >
          <ChatSidePanel
            defaultExpanded={!isChatPanelCollapsed}
            onCollapseChange={handleChatPanelCollapseChange}
            onWidthChange={handleChatPanelWidthChange}
          />
        </div>

      {/* Mobile filter drawer */}
      <Drawer
        isOpen={isFilterDrawerOpen}
        onOpenChange={setIsFilterDrawerOpen}
        placement="left"
        size="xs"
      >
        <DrawerContent>
          <DrawerHeader className="border-b border-divider">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} />
              <span>{t("filters")}</span>
              {activeFilterCount > 0 && (
                <span className="text-xs text-default-400">
                  {t("activeFiltersCount", { count: activeFilterCount })}
                </span>
              )}
            </div>
          </DrawerHeader>
          <DrawerBody className="px-4 py-4">
            <FilterMenu />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
