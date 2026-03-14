"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Search, Eye } from "lucide-react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { setTextSearch, setSelectedFilters } from "@/lib/redux/slices/querySlice";
import { useGetPropertiesQuery } from "@/lib/redux/services/api";
import { useFilterChips } from "@/hooks/use-filter-chips";
import SearchResultsModal from "./search-results-modal";

interface SearchQueryCardProps {
  query: {
    textSearch: string;
    filterIds: number[];
  };
  status: "pending" | "executed";
  /** Only the first suggestion should auto-execute to avoid redundant API calls */
  autoExecute?: boolean;
}

export default function SearchQueryCard({ query, status, autoExecute = false }: SearchQueryCardProps) {
  const dispatch = useDispatch();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("chat.search");
  const { data: properties } = useGetPropertiesQuery(locale);
  const filterChips = useFilterChips(properties, query.filterIds);
  const isOnBrowse = pathname === "/browse";
  const hasExecuted = useRef(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (autoExecute && isOnBrowse && !hasExecuted.current && status === "pending") {
      hasExecuted.current = true;
      dispatch(setTextSearch(query.textSearch));
      dispatch(setSelectedFilters(query.filterIds));
    }
  }, [autoExecute, isOnBrowse, status, query, dispatch]);

  const handleSearch = () => {
    if (isOnBrowse) {
      dispatch(setTextSearch(query.textSearch));
      dispatch(setSelectedFilters(query.filterIds));
    } else {
      setIsModalOpen(true);
    }
  };

  const isExecuted = isOnBrowse || status === "executed";

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-default-50 dark:bg-default-100/5 border border-default-200 mt-2">
      <div className="flex items-center gap-2 text-xs text-default-500">
        <Search size={14} />
        {isExecuted ? (
          <span className="font-medium text-success">{t("searched")}</span>
        ) : (
          <span className="font-medium">{t("searchQuery")}</span>
        )}
      </div>

      {query.textSearch && (
        <div className="text-sm text-foreground">
          &ldquo;{query.textSearch}&rdquo;
        </div>
      )}

      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filterChips.map((chip) => (
            <Chip
              key={chip.id}
              size="sm"
              variant="flat"
              color="primary"
            >
              {chip.label}
            </Chip>
          ))}
        </div>
      )}

      <Button
        size="sm"
        color="primary"
        variant="flat"
        startContent={isOnBrowse ? <Search size={14} /> : <Eye size={14} />}
        onPress={handleSearch}
        className="self-start mt-1"
      >
        {isOnBrowse ? t("searchQuery") : t("viewResults")}
      </Button>

      {!isOnBrowse && (
        <SearchResultsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          query={query}
        />
      )}
    </div>
  );
}
