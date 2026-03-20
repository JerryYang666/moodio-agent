"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { ChevronDown, ChevronUp, Table2, Clapperboard, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MessageContentPart } from "@/lib/llm/types";
import { AI_SHOTLIST_DRAG_MIME } from "./asset-dnd";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";
import { getViewportVisibleCenterPosition } from "@/lib/desktop/types";

type AgentShotListPart = Extract<MessageContentPart, { type: "agent_shot_list" }>;

interface ShotListCardProps {
  part: AgentShotListPart;
  desktopId?: string;
  chatId?: string;
}

export default function ShotListCard({ part, desktopId, chatId }: ShotListCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isStreaming = part.status === "streaming";
  const t = useTranslations();

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [sendToDesktopOpen, setSendToDesktopOpen] = useState(false);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isStreaming) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isStreaming]);

  const handleSendToDesktop = useCallback(async () => {
    setContextMenu(null);

    if (desktopId) {
      try {
        const pos = getViewportVisibleCenterPosition(700, 40 + part.rows.length * 36 + 40);
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [{
              assetType: "table",
              metadata: {
                title: part.title,
                columns: part.columns,
                rows: part.rows,
                chatId: chatId || undefined,
                status: "complete",
              },
              posX: pos.x,
              posY: pos.y,
              width: 700,
              height: 40 + part.rows.length * 36 + 40,
            }],
          }),
        });
        if (!res.ok) throw new Error("Failed to send shotlist");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
        addToast({ title: t("desktop.addedToDesktop"), color: "success" });
      } catch {
        addToast({ title: t("common.error"), color: "danger" });
      }
    } else {
      setSendToDesktopOpen(true);
    }
  }, [desktopId, chatId, part, t]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (isStreaming) return;
    try {
      e.dataTransfer.setData(
        AI_SHOTLIST_DRAG_MIME,
        JSON.stringify({
          title: part.title,
          columns: part.columns,
          rows: part.rows,
          chatId: chatId || null,
        })
      );
      e.dataTransfer.effectAllowed = "copy";
    } catch {
      // ignore
    }
  }, [isStreaming, part, chatId]);

  if (isStreaming) {
    return (
      <Card className="my-3 border border-secondary/20 bg-linear-to-br from-secondary/5 to-primary/5 dark:from-secondary/10 dark:to-primary/10">
        <CardBody className="p-4 flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-sm text-default-500">Generating shot list...</span>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card
        className="my-3 border border-secondary/20 bg-linear-to-br from-secondary/5 to-primary/5 dark:from-secondary/10 dark:to-primary/10 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={handleDragStart}
        onContextMenu={handleContextMenu}
      >
        <CardBody className="p-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-3 p-3 hover:bg-default-100/50 transition-colors rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
              <Clapperboard size={16} className="text-secondary" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold truncate">
                {part.title || "Shot List"}
              </div>
              <div className="text-xs text-default-400">
                {part.rows.length} shots &middot; {part.columns.length} columns
              </div>
            </div>
            <Chip size="sm" variant="flat" color="secondary" startContent={<Table2 size={12} />}>
              Table
            </Chip>
            {isExpanded ? (
              <ChevronUp size={16} className="text-default-400 shrink-0" />
            ) : (
              <ChevronDown size={16} className="text-default-400 shrink-0" />
            )}
          </button>

          {isExpanded && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {part.columns.map((col, i) => (
                      <th
                        key={i}
                        className="px-2 py-1.5 text-left font-semibold text-default-600 bg-default-100 border border-divider whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {part.rows.map((row) => (
                    <tr key={row.id}>
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-2 py-1.5 border border-divider text-default-700 whitespace-pre-wrap"
                        >
                          {cell.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-divider bg-background shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-default-100 transition-colors text-left"
            onClick={handleSendToDesktop}
          >
            <Monitor size={14} />
            {t("chat.sendSelectionToDesktop")}
          </button>
        </div>
      )}

      {/* Desktop picker modal (when not on desktop page) */}
      <SendToDesktopModal
        isOpen={sendToDesktopOpen}
        onOpenChange={setSendToDesktopOpen}
        assets={[{
          assetType: "table",
          metadata: {
            title: part.title,
            columns: part.columns,
            rows: part.rows,
            chatId: chatId || undefined,
            status: "complete",
          },
        }]}
        desktopId={desktopId}
      />
    </>
  );
}
