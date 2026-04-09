"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { CellComment } from "@/lib/production-table/types";

interface CellCommentPopoverProps {
  x: number;
  y: number;
  comment: CellComment | null;
  onSave: (text: string | null) => void;
  onClose: () => void;
}

export function CellCommentPopover({
  x,
  y,
  comment,
  onSave,
  onClose,
}: CellCommentPopoverProps) {
  const t = useTranslations("productionTable");
  const [draft, setDraft] = useState(comment?.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    onSave(trimmed || null);
    onClose();
  }, [draft, onSave, onClose]);

  const handleDelete = useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [onClose, handleSave]
  );

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-[260px] bg-content1 border border-default-200 rounded-lg shadow-lg overflow-hidden"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {comment && (
        <div className="px-3 pt-2 text-[11px] text-default-400">
          {comment.authorName}
          <span className="ml-1.5">{new Date(comment.updatedAt).toLocaleString()}</span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="w-full h-24 p-3 text-sm bg-transparent border-none outline-none resize-none"
        placeholder={t("commentPlaceholder")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-between px-3 py-2 border-t border-default-200">
        <div>
          {comment && (
            <button
              className="flex items-center gap-1 text-xs text-danger hover:text-danger-600 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={12} />
              {t("deleteComment")}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2.5 py-1 text-xs text-default-500 hover:text-default-700 transition-colors"
            onClick={onClose}
          >
            {t("cancelComment")}
          </button>
          <button
            className="px-2.5 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
            onClick={handleSave}
          >
            {t("saveComment")}
          </button>
        </div>
      </div>
    </div>
  );
}
