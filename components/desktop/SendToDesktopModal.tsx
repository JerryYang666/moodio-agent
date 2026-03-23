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
import { getViewportVisibleCenterPosition, findNonOverlappingPosition, type AssetRect } from "@/lib/desktop/types";
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

async function sendAssetsToDesktop(
  targetDesktopId: string,
  assets: SendToDesktopModalProps["assets"],
  onOpenChange: (isOpen: boolean) => void,
  useViewportPlacement: boolean,
  addedToDesktopMsg: string,
  assetsSentMsg: (count: number) => string,
) {
  const res = await fetch(`/api/desktop/${targetDesktopId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assets: assets.map((a, i) => {
        if (useViewportPlacement) {
          const sizeByType =
            a.assetType === "image"
              ? { w: 300, h: 300 }
              : a.assetType === "video" || a.assetType === "public_video"
                ? { w: 300, h: 300 }
                : a.assetType === "text"
                  ? { w: 300, h: 200 }
                  : a.assetType === "table"
                    ? { w: 700, h: 40 + (Array.isArray((a.metadata as any)?.rows) ? (a.metadata as any).rows.length * 36 : 0) + 40 }
                    : { w: 400, h: 300 };
          const pos = getViewportVisibleCenterPosition(sizeByType.w, sizeByType.h);
          const vp = typeof window !== "undefined" ? window.__desktopViewport : undefined;
          const adjusted = findNonOverlappingPosition(pos.x + i * 280, pos.y, sizeByType.w, sizeByType.h, vp?.assetRects);
          return { ...a, posX: adjusted.x, posY: adjusted.y };
        }
        return {
          ...a,
          posX: (i % 2) * 280,
          posY: Math.floor(i / 2) * 280,
        };
      }),
    }),
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
  const [selectedDesktopId, setSelectedDesktopId] = useState("");
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
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, desktopId]);

  const handleSend = useCallback(async () => {
    if (!selectedDesktopId || assets.length === 0) return;
    try {
      await guardedSend(selectedDesktopId, false);
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
