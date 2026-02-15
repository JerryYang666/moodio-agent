"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSelector } from "react-redux";
import { useFeatureFlag } from "@/lib/feature-flags";
import FilterMenu from "@/components/browse/FilterMenu";
import SearchBar from "@/components/browse/SearchBar";
import Breadcrumb from "@/components/browse/Breadcrumb";
import VideoGrid from "@/components/browse/VideoGrid";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
} from "@heroui/drawer";
import type { RootState } from "@/lib/redux/store";

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
      <main className="flex-1 h-screen px-4 py-6 min-w-0 flex flex-col">
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
          {/* Desktop sidebar filter — hidden on mobile */}
          <div className="mr-6 shrink-0 w-64 hidden lg:block">
            <FilterMenu />
          </div>

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="shrink-0">
              <Breadcrumb />
            </div>

            <VideoGrid />
          </div>
        </div>
      </main>

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
