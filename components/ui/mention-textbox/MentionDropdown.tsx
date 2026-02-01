"use client";

import { useEffect, useRef, useMemo, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MentionDropdownProps, MentionItem } from "./types";
import clsx from "clsx";

export function MentionDropdown({
  isOpen,
  items,
  filterQuery,
  highlightedIndex,
  onSelect,
  onClose,
  position,
  renderItem,
  t = (key) => key,
}: MentionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [flipToTop, setFlipToTop] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState({ top: position.top, left: position.left });

  // Filter items based on query
  const filteredItems = useMemo(() => {
    // If filterQuery is empty, items are already filtered by TipTap
    if (!filterQuery) return items;
    const query = filterQuery.toLowerCase();
    return items.filter((item) =>
      item.label.toLowerCase().includes(query)
    );
  }, [items, filterQuery]);

  // Check if dropdown should flip to top or adjust horizontally to avoid viewport overflow
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current) return;

    const dropdown = dropdownRef.current;
    const rect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let newTop = position.top;
    let newLeft = position.left;
    let shouldFlip = false;
    
    // Vertical flip: if dropdown overflows bottom, flip it above
    if (position.top + rect.height > viewportHeight) {
      // Position above the trigger (subtract dropdown height and some offset)
      shouldFlip = true;
      newTop = position.top - rect.height - 24; // 24px for the line height
    }
    
    // Horizontal adjustment: if dropdown overflows right edge, shift it left
    if (newLeft + rect.width > viewportWidth) {
      newLeft = viewportWidth - rect.width - 8; // 8px padding from edge
    }
    
    // Don't go off the left edge
    if (newLeft < 8) {
      newLeft = 8;
    }
    
    // Don't go off the top
    if (newTop < 8) {
      newTop = 8;
      shouldFlip = false;
    }
    
    setFlipToTop(shouldFlip);
    setAdjustedPosition({ top: newTop, left: newLeft });
  }, [isOpen, position, filteredItems.length]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) return;
    
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    
    const itemElements = dropdown.querySelectorAll("[data-mention-dropdown-item]");
    const highlightedItem = itemElements[highlightedIndex] as HTMLElement;
    
    if (highlightedItem) {
      highlightedItem.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, highlightedIndex]);

  if (!isOpen) return null;

  const defaultRenderItem = (item: MentionItem, isHighlighted: boolean) => (
    <div
      className={clsx(
        "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
        isHighlighted ? "bg-primary/20 dark:bg-primary/30" : "hover:bg-default-100"
      )}
    >
      {item.thumbnail && (
        <img
          src={item.thumbnail}
          alt=""
          className="w-8 h-8 rounded object-cover shrink-0"
        />
      )}
      <span className="truncate text-sm">{item.label}</span>
    </div>
  );

  const dropdownContent = (
    <div
      ref={dropdownRef}
      data-mention-dropdown
      className="fixed z-9999 bg-background border border-divider rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[300px] max-h-[240px] overflow-y-auto"
      style={{
        top: adjustedPosition.top,
        left: adjustedPosition.left,
      }}
    >
      {filteredItems.length === 0 ? (
        <div className="px-3 py-4 text-sm text-default-400 text-center">
          {items.length === 0
            ? t("noItemsAvailable")
            : t("noMatchingItems")}
        </div>
      ) : (
        filteredItems.map((item, index) => (
          <div
            key={item.id}
            data-mention-dropdown-item
            onClick={() => onSelect(item)}
            onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
          >
            {renderItem
              ? renderItem(item, index === highlightedIndex)
              : defaultRenderItem(item, index === highlightedIndex)}
          </div>
        ))
      )}
    </div>
  );

  // Use portal to render dropdown at document body level
  if (typeof document !== "undefined") {
    return createPortal(dropdownContent, document.body);
  }

  return dropdownContent;
}

export default MentionDropdown;
