"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSelector } from "react-redux";
import FilterMenu from "@/components/browse/FilterMenu";
import SearchBar from "@/components/browse/SearchBar";
import Breadcrumb from "@/components/browse/Breadcrumb";
import { BreadcrumbDescription } from "@/components/browse/Breadcrumb";
import VideoGrid from "@/components/browse/VideoGrid";
import { LoginModal } from "@/components/auth/LoginModal";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { SlidersHorizontal, Filter, BotMessageSquare, LogIn } from "lucide-react";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
} from "@heroui/drawer";
import type { RootState } from "@/lib/redux/store";

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

export default function PreviewBrowsePage() {
  const t = useTranslations("browse");
  const tPreview = useTranslations("previewBrowse");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const selectedFilters = useSelector(
    (state: RootState) => state.query.selectedFilters
  );
  const contentTypes = useSelector(
    (state: RootState) => state.query.contentTypes
  );
  const isAigc = useSelector((state: RootState) => state.query.isAigc);

  const activeFilterCount =
    selectedFilters.length +
    contentTypes.length +
    (isAigc !== undefined ? 1 : 0);

  useDisableBodyScroll(true);

  const handleLoginRequired = useCallback(() => {
    setIsLoginModalOpen(true);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-divider">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-2 rounded-xl">
            <BotMessageSquare className="text-primary" size={24} />
          </div>
          <span className="text-lg font-semibold">{tPreview("title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <LanguageSwitch />
          <Button
            color="primary"
            variant="flat"
            size="sm"
            startContent={<LogIn size={16} />}
            as="a"
            href="/auth/login"
          >
            {tPreview("login")}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar filter */}
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
              onSearchOverride={handleLoginRequired}
            />

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
              <VideoGrid
                descriptionSlot={<BreadcrumbDescription />}
                onPhotoClickOverride={handleLoginRequired}
              />
            </div>
          </div>
        </main>
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

      {/* Login modal — non-dismissable */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
}
