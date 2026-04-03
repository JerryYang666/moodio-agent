"use client";

import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Search, Star, X } from "lucide-react";

export interface AssetSearchFilterProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterRating: number | null;
  onFilterRatingChange: (rating: number | null) => void;
  labels: {
    searchAssets: string;
    filterByRating: string;
  };
}

export default function AssetSearchFilter({
  searchQuery,
  onSearchChange,
  filterRating,
  onFilterRatingChange,
  labels,
}: AssetSearchFilterProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        placeholder={labels.searchAssets}
        value={searchQuery}
        onValueChange={onSearchChange}
        startContent={<Search size={18} className="text-default-400" />}
        isClearable
        onClear={() => onSearchChange("")}
        className="max-w-sm"
      />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-default-500 mr-0.5">
          {labels.filterByRating}:
        </span>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="p-0.5 leading-none cursor-pointer"
            onClick={() =>
              onFilterRatingChange(filterRating === star ? null : star)
            }
          >
            <Star
              size={18}
              className={
                filterRating !== null && star <= filterRating
                  ? "text-yellow-400 fill-yellow-400"
                  : "text-default-300"
              }
            />
          </button>
        ))}
        {filterRating !== null && (
          <Button
            size="sm"
            variant="light"
            isIconOnly
            onPress={() => onFilterRatingChange(null)}
            className="min-w-6 w-6 h-6"
          >
            <X size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
