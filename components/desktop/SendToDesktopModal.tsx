"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import { getViewportVisibleCenterPosition, findNonOverlappingPosition, getGridPlacementPositions, aspectRatioDimensions, type AssetRect } from "@/lib/desktop/types";
import { hasWriteAccess, type Permission } from "@/lib/permissions";

interface SendToDesktopModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  assets: Array<{
    assetType: "image" | "video" | "public_video" | "text" | "table";
    metadata: Record<string, unknown>;
  }>;
  /** When provided, skip desktop selection and send directly to this desktop */
  desktopId?: string;
}

interface DesktopOption {
  id: string;
  name: string;
  permission: Permission;
  isOwner: boolean;
}

const SEND_DEBOUNCE_MS = 2000;
const LAST_DESKTOP_KEY = "moodio:lastSelectedDesktopId";

function getAssetSize(a: SendToDesktopModalProps["assets"][number]): { w: number; h: number } {
  const arDims = (a.assetType === "image" || a.assetType === "video" || a.assetType === "public_video")
    ? aspectRatioDimensions((a.metadata as any)?.aspectRatio, 300)
    : null;
  if (a.assetType === "image") return arDims ?? { w: 300, h: 300 };
  if (a.assetType === "video" || a.assetType === "public_video") return arDims ?? { w: 300, h: 300 };
  if (a.assetType === "text") return { w: 300, h: 200 };
  if (a.assetType === "table") {
    const rows = Array.isArray((a.metadata as any)?.rows) ? (a.metadata as any).rows.length : 0;
    return { w: 700, h: 40 + rows * 36 + 40 };
  }
  return { w: 400, h: 300 };
}

async function sendAssetsToDesktop(
  targetDesktopId: string,
  assets: SendToDesktopModalProps["assets"],
  onOpenChange: (isOpen: boolean) => void,
  useViewportPlacement: boolean,
  addedToDesktopMsg: string,
  assetsSentMsg: (count: number) => string,
) {
  let positionedAssets;

  if (useViewportPlacement) {
    // User is actively viewing the desktop — place near viewport center
    positionedAssets = assets.map((a, i) => {
      const size = getAssetSize(a);
      const pos = getViewportVisibleCenterPosition(size.w, size.h);
      const vp = typeof window !== "undefined" ? window.__desktopViewport : undefined;
      const adjusted = findNonOverlappingPosition(pos.x + i * 280, pos.y, size.w, size.h, vp?.assetRects);
      return { ...a, posX: adjusted.x, posY: adjusted.y };
    });
  } else {
    // User is NOT on the desktop page — use grid layout (rows of 4)
    // Fetch existing asset positions to avoid overlaps
    let existingRects: AssetRect[] = [];
    try {
      const existingRes = await fetch(`/api/desktop/${targetDesktopId}/assets`);
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        const existingAssets = existingData.assets || [];
        existingRects = existingAssets.map((ea: any) => ({
          x: ea.posX ?? 0,
          y: ea.posY ?? 0,
          w: ea.width ?? 300,
          h: ea.height ?? 300,
        }));
      }
    } catch {
      // If fetching fails, proceed without existing rects — grid will still work
    }

    const sizes = assets.map(getAssetSize);
    const positions = getGridPlacementPositions(sizes, existingRects);
    positionedAssets = assets.map((a, i) => ({
      ...a,
      posX: positions[i].x,
      posY: positions[i].y,
    }));
  }

  const res = await fetch(`/api/desktop/${targetDesktopId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets: positionedAssets }),
  });
  if (!res.ok) throw new Error("Failed to add to desktop");
  const data = await res.json();

  if (useViewportPlacement) {
    window.dispatchEvent(
      new CustomEvent("desktop-asset-added", {
        detail: { assets: data.assets, desktopId: targetDesktopId },
      })
    );
  }

  addToast({
    title: addedToDesktopMsg,
    description: assetsSentMsg(assets.length),
    color: "success",
  });
  onOpenChange(false);
}

export default function SendToDesktopModal({
  isOpen,
  onOpenChange,
  assets,
  desktopId,
}: SendToDesktopModalProps) {
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");

  const [desktops, setDesktops] = useState<DesktopOption[]>([]);
  const [selectedDesktopId, setSelectedDesktopId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LAST_DESKTOP_KEY) ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);
  const lastSendAtRef = useRef(0);
  const directSendKeyRef = useRef<string | null>(null);
  const assetsSignature = useMemo(() => JSON.stringify(assets), [assets]);

  const guardedSend = useCallback(
    async (
      targetDesktopId: string,
      useViewportPlacement: boolean
    ): Promise<boolean> => {
      if (!targetDesktopId || assets.length === 0) return false;

      const now = Date.now();
      if (
        inFlightRef.current ||
        now - lastSendAtRef.current < SEND_DEBOUNCE_MS
      ) {
        return false;
      }

      inFlightRef.current = true;
      lastSendAtRef.current = now;
      setSending(true);

      try {
        await sendAssetsToDesktop(
          targetDesktopId,
          assets,
          onOpenChange,
          useViewportPlacement,
          t("addedToDesktop"),
          (count) => t("assetsSent", { count }),
        );
        return true;
      } finally {
        inFlightRef.current = false;
        setSending(false);
      }
    },
    [assets, onOpenChange, t]
  );

  // When a desktopId is provided, send immediately without showing a picker
  useEffect(() => {
    if (!isOpen || !desktopId || assets.length === 0) return;
    const directSendKey = `${desktopId}:${assetsSignature}`;
    if (directSendKeyRef.current === directSendKey) return;
    directSendKeyRef.current = directSendKey;

    guardedSend(desktopId, true)
      .catch(() => {
        addToast({
          title: tCommon("error"),
          description: t("failedToSend"),
          color: "danger",
        });
      });
  }, [isOpen, desktopId, assets.length, assetsSignature, guardedSend, t, tCommon]);

  // Reset per-open-session direct-send key.
  useEffect(() => {
    if (!isOpen) {
      directSendKeyRef.current = null;
    }
  }, [isOpen]);

  // Only fetch desktop list when no desktopId is provided (picker mode)
  useEffect(() => {
    if (!isOpen || desktopId) return;
    setLoading(true);
    fetch("/api/desktop")
      .then((res) => res.json())
      .then((data) => {
        const writable = (data.desktops || []).filter(
          (d: DesktopOption) =>
            hasWriteAccess(d.permission)
        );
        setDesktops(writable);
        setSelectedDesktopId((prev) => {
          if (prev && writable.some((d: DesktopOption) => d.id === prev)) return prev;
          return "";
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, desktopId]);

  const handleSend = useCallback(async () => {
    if (!selectedDesktopId || assets.length === 0) return;
    try {
      await guardedSend(selectedDesktopId, false);
      localStorage.setItem(LAST_DESKTOP_KEY, selectedDesktopId);
    } catch {
      addToast({
        title: tCommon("error"),
        description: t("failedToSend"),
        color: "danger",
      });
    }
  }, [selectedDesktopId, assets.length, guardedSend, t, tCommon]);

  // Direct-send mode: render nothing visible (the effect handles everything)
  if (desktopId) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{t("sendToDesktop")}</ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : desktops.length === 0 ? (
                <p className="text-default-500">
                  {t("noDesktopsAvailable")}
                </p>
              ) : (
                <Select
                  label={t("selectDesktop")}
                  placeholder={t("chooseDesktop")}
                  selectedKeys={selectedDesktopId ? [selectedDesktopId] : []}
                  onChange={(e) => setSelectedDesktopId(e.target.value)}
                >
                  {desktops.map((d) => (
                    <SelectItem key={d.id}>{d.name}</SelectItem>
                  ))}
                </Select>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button
                color="primary"
                onPress={handleSend}
                isLoading={sending}
                isDisabled={!selectedDesktopId || desktops.length === 0}
              >
                {tCommon("send")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
