"use client";

import { getTagColor } from "@/lib/tag-colors";

interface CollectionTagsProps {
  tags: { label: string; color: string }[];
  maxVisible?: number;
}

export default function CollectionTags({ tags, maxVisible = 3 }: CollectionTagsProps) {
  if (tags.length === 0) return null;

  const visible = tags.slice(0, maxVisible);
  const remaining = tags.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag, i) => {
        const color = getTagColor(tag.color);
        return (
          <span
            key={i}
            className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium leading-4 ${color.bg} ${color.text}`}
          >
            {tag.label}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium leading-4 bg-default-100 text-default-600">
          +{remaining}
        </span>
      )}
    </div>
  );
}
