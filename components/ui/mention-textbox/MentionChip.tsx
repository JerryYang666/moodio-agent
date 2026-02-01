"use client";

import { MentionChipProps } from "./types";
import clsx from "clsx";
import { X } from "lucide-react";

/**
 * Generic chip component for displaying mentions inline.
 * Can be customized via className or used as a base for type-specific chips.
 */
export function MentionChip({
  item,
  removable = false,
  onRemove,
  className,
}: MentionChipProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 bg-default-100 rounded-full px-2 py-0.5 text-xs",
        "align-middle select-none",
        className
      )}
    >
      {item.thumbnail && (
        <img
          src={item.thumbnail}
          alt=""
          className="w-4 h-4 rounded-sm object-cover shrink-0"
        />
      )}
      <span className="truncate max-w-[80px]">{item.label}</span>
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 p-0.5 rounded-full hover:bg-default-200 transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export default MentionChip;
