"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSelector } from "react-redux";
import { useFeatureFlag } from "@/lib/feature-flags";
import FilterMenu from "@/components/browse/FilterMenu";
import SearchBar from "@/components/browse/SearchBar";
import Breadcrumb from "@/components/browse/Breadcrumb";
import VideoGrid from "@/components/browse/VideoGrid";
import ChatSidePanel from "@/components/chat/chat-side-panel";
import { siteConfig } from "@/config/site";
import { SlidersHorizontal, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
} from "@heroui/drawer";
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
  const showBrowse = useFeatureFlag<boolean>("user_retrieval") ?? false;
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);

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
  useDisableBodyScroll(showBrowse);

  if (!showBrowse) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-default-500">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p>{t("comingSoon")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Main browse content */}
      <main className="flex-1 px-4 py-6 min-w-0 flex flex-col overflow-hidden">
          <div className="mb-6 shrink-0 flex gap-2 items-start">
            <SearchBar
              placeholder={t("searchPlaceholder")}
              className="flex-1 min-w-0"
            />

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
            {/* Desktop sidebar filter — collapsible, hidden on mobile */}
            <div
              className={`mr-4 shrink-0 hidden lg:flex flex-col transition-[width] duration-300 ease-in-out overflow-hidden ${
                isFilterCollapsed ? "w-0 mr-0" : "w-64"
              }`}
            >
              <div className="w-64 h-full flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-default-600">{t("filters")}</span>
                  <Button
                    isIconOnly
                    variant="light"
                    size="sm"
                    onPress={() => setIsFilterCollapsed(true)}
                    aria-label="Collapse filters"
                  >
                    <PanelLeftClose size={16} />
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <FilterMenu />
                </div>
              </div>
            </div>

            {/* Collapsed filter toggle — only visible when sidebar is collapsed */}
            {isFilterCollapsed && (
              <div className="shrink-0 hidden lg:flex items-start mr-2 pt-0.5">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={() => setIsFilterCollapsed(false)}
                  aria-label="Expand filters"
                >
                  <Badge
                    content={activeFilterCount}
                    color="primary"
                    size="sm"
                    isInvisible={activeFilterCount === 0}
                    placement="top-right"
                  >
                    <PanelLeftOpen size={16} />
                  </Badge>
                </Button>
              </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div className="shrink-0">
                <Breadcrumb />
              </div>

              <VideoGrid chatPanelWidth={chatPanelActualWidth} />
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
