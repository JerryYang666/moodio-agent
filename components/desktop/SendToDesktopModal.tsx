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
import { getViewportCenterPosition } from "@/lib/desktop/types";
import { hasWriteAccess, type Permission } from "@/lib/permissions";

interface SendToDesktopModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  assets: Array<{
    assetType: "image" | "video";
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
) {
  const res = await fetch(`/api/desktop/${targetDesktopId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assets: assets.map((a, i) => {
        if (useViewportPlacement) {
          const pos = getViewportCenterPosition();
          return { ...a, posX: pos.x + i * 280, posY: pos.y };
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
    title: "Added to desktop",
    description: `${assets.length} asset(s) sent to desktop`,
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
          useViewportPlacement
        );
        return true;
      } finally {
        inFlightRef.current = false;
        setSending(false);
      }
    },
    [assets, onOpenChange]
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
          title: "Error",
          description: "Failed to send to desktop",
          color: "danger",
        });
      });
  }, [isOpen, desktopId, assets.length, assetsSignature, guardedSend]);

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
        title: "Error",
        description: "Failed to send to desktop",
        color: "danger",
      });
    }
  }, [selectedDesktopId, assets.length, guardedSend]);

  // Direct-send mode: render nothing visible (the effect handles everything)
  if (desktopId) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Send to Desktop</ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : desktops.length === 0 ? (
                <p className="text-default-500">
                  No desktops available. Create one first.
                </p>
              ) : (
                <Select
                  label="Select desktop"
                  placeholder="Choose a desktop"
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
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleSend}
                isLoading={sending}
                isDisabled={!selectedDesktopId || desktops.length === 0}
              >
                Send
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
