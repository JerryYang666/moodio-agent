"use client";

import { useState, useEffect, useCallback } from "react";
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

interface SendToDesktopModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  assets: Array<{
    assetType: "image" | "video";
    metadata: Record<string, unknown>;
  }>;
}

interface DesktopOption {
  id: string;
  name: string;
  permission: string;
  isOwner: boolean;
}

export default function SendToDesktopModal({
  isOpen,
  onOpenChange,
  assets,
}: SendToDesktopModalProps) {
  const [desktops, setDesktops] = useState<DesktopOption[]>([]);
  const [selectedDesktopId, setSelectedDesktopId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/desktop")
      .then((res) => res.json())
      .then((data) => {
        const writable = (data.desktops || []).filter(
          (d: DesktopOption) =>
            d.permission === "owner" || d.permission === "collaborator"
        );
        setDesktops(writable);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    if (!selectedDesktopId || assets.length === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/desktop/${selectedDesktopId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets: assets.map((a, i) => ({
            ...a,
            posX: (i % 2) * 280,
            posY: Math.floor(i / 2) * 280,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to add to desktop");
      addToast({
        title: "Added to desktop",
        description: `${assets.length} asset(s) sent to desktop`,
        color: "success",
      });
      onOpenChange(false);
    } catch {
      addToast({
        title: "Error",
        description: "Failed to send to desktop",
        color: "danger",
      });
    } finally {
      setSending(false);
    }
  }, [selectedDesktopId, assets, onOpenChange]);

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
