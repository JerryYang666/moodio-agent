"use client";

import { MentionItem } from "@/components/ui/mention-textbox";
import clsx from "clsx";

interface ImageChipProps {
  item: MentionItem;
  isHighlighted?: boolean;
}

/**
 * Image-specific chip renderer for the mention dropdown.
 * Shows a thumbnail and title for image mentions.
 */
export function ImageChipDropdownItem({ item, isHighlighted }: ImageChipProps) {
  return (
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
          className="w-10 h-10 rounded object-cover shrink-0 border border-divider"
        />
      )}
      <div className="flex flex-col min-w-0">
        <span className="truncate text-sm font-medium">{item.label}</span>
        {typeof item.metadata?.source === "string" ? (
          <span className="text-xs text-default-400 capitalize">
            {item.metadata.source.replace("_", " ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Inline chip display for images in the textbox.
 * This is rendered as HTML inside the contenteditable.
 */
export function getImageChipHTML(item: MentionItem): string {
  const thumbnailHTML = item.thumbnail
    ? `<img src="${item.thumbnail}" alt="" style="width: 16px; height: 16px; border-radius: 3px; object-fit: cover; margin-right: 4px; flex-shrink: 0;" />`
    : "";

  return `<span 
    class="mention-chip" 
    data-mention-id="${item.id}" 
    data-mention-type="${item.type}"
    data-mention-label="${escapeAttr(item.label)}"
    ${item.thumbnail ? `data-mention-thumbnail="${escapeAttr(item.thumbnail)}"` : ""}
    contenteditable="false"
    style="display: inline-flex; align-items: center; background: hsl(var(--heroui-default-100)); border-radius: 9999px; padding: 2px 8px 2px 4px; margin: 0 2px; font-size: 12px; line-height: 1.4; vertical-align: middle; user-select: none; cursor: default; border: 1px solid hsl(var(--heroui-divider));"
  >${thumbnailHTML}<span style="max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(item.label)}</span></span>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export default ImageChipDropdownItem;
