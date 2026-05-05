"use client";

import React, { useCallback, useState } from "react";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import type { ElementAsset } from "@/lib/video/models";
import ElementEditorModal, {
  type ElementEditorSubmitPayload,
} from "./element-editor-modal";
import AssetPickerModal, { type AssetSummary } from "./asset-picker-modal";
import { uploadImage } from "@/lib/upload/client";
import { uploadAudio } from "@/lib/upload/audio-client";
import { uploadVideo } from "@/lib/upload/video-client";

type PickRequest =
  | { kind: "image"; slot: number }
  | { kind: "image-new" }
  | { kind: "video" }
  | { kind: "voice" };

interface ElementEditorControllerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;

  /** Creation destination. Permission is enforced server-side. */
  projectId?: string;
  collectionId?: string | null;
  folderId?: string | null;

  /** Pre-fill the editor in edit mode. */
  initialElement?: ElementAsset | null;

  /**
   * Pre-resolved URLs for constituents of `initialElement`. Populating these
   * lets the editor show the existing images/video without a round-trip.
   * Callers typically pass what the assets API already returned.
   */
  initialImageUrls?: Record<string, string>;
  initialVideoUrl?: { id: string; url: string };

  /** Called after a successful create/update so callers can refetch. */
  onSaved?: (asset: unknown) => void;
}

/**
 * Self-contained element creation/edit flow.
 *
 * Owns both modals (the editor + its own scoped AssetPickerModal) so it can be
 * dropped into any page — collection, folder, project, or chat composer —
 * without colliding with that page's primary asset picker.
 *
 * Modal stacking is handled by deferring editor re-open via requestAnimationFrame
 * after the nested picker closes; avoids HeroUI backdrop/focus-trap collisions.
 */
export default function ElementEditorController({
  isOpen,
  onOpenChange,
  projectId,
  collectionId,
  folderId,
  initialElement = null,
  initialImageUrls,
  initialVideoUrl,
  onSaved,
}: ElementEditorControllerProps) {
  const t = useTranslations();

  const [isSubPickerOpen, setIsSubPickerOpen] = useState(false);
  const [subPickerMode, setSubPickerMode] = useState<
    "image" | "video" | "voice"
  >("image");
  const [pickedAssetId, setPickedAssetId] = useState<string | null>(null);
  const [imageUrlCache, setImageUrlCache] = useState<Record<string, string>>(
    initialImageUrls ?? {}
  );
  const [videoUrlCache, setVideoUrlCache] = useState<Record<string, string>>(
    initialVideoUrl ? { [initialVideoUrl.id]: initialVideoUrl.url } : {}
  );
  const [isCreatingVoice, setIsCreatingVoice] = useState(false);

  // Keep URL caches in sync if the caller swaps the edit target.
  React.useEffect(() => {
    if (initialImageUrls) {
      setImageUrlCache((prev) => ({ ...prev, ...initialImageUrls }));
    }
    if (initialVideoUrl) {
      setVideoUrlCache((prev) => ({
        ...prev,
        [initialVideoUrl.id]: initialVideoUrl.url,
      }));
    }
  }, [initialImageUrls, initialVideoUrl]);

  const handleRequestPick = useCallback((req: PickRequest) => {
    // Stack the sub-picker on top of the editor. The picker already sets
    // `wrapper: z-[120]` so it layers above the editor's default backdrop.
    // Keeping the editor mounted preserves its form state (name, description,
    // existing slot assignments, and — crucially — its `pendingPick` marker
    // so the picked asset can be routed to the right slot on return).
    setSubPickerMode(
      req.kind === "video"
        ? "video"
        : req.kind === "voice"
          ? "voice"
          : "image"
    );
    setIsSubPickerOpen(true);
  }, []);

  const consumePick = useCallback((id: string) => {
    setIsSubPickerOpen(false);
    setPickedAssetId(id);
  }, []);

  const handleSubPickerSelect = useCallback(
    async (asset: AssetSummary) => {
      if (subPickerMode === "video") {
        const vid = asset.assetId || asset.imageId;
        const vurl = asset.videoUrl || asset.imageUrl;
        setVideoUrlCache((prev) => ({ ...prev, [vid]: vurl }));
        consumePick(vid);
        return;
      }
      if (subPickerMode === "voice") {
        // Close the picker immediately so the user sees the editor and a
        // spinner while FAL creates the voice. Keep the pendingPick marker
        // alive in the editor so the resulting voice_id routes correctly.
        setIsSubPickerOpen(false);
        setIsCreatingVoice(true);
        try {
          const audioId = asset.assetId || asset.imageId;
          const res = await fetch("/api/elements/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioId }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            addToast({
              title: err?.error || t("chat.element.voiceCreateFailed"),
              color: "danger",
            });
            return;
          }
          const { voiceId } = (await res.json()) as { voiceId: string };
          setPickedAssetId(voiceId);
        } catch (e) {
          addToast({
            title:
              e instanceof Error ? e.message : t("chat.element.voiceCreateFailed"),
            color: "danger",
          });
        } finally {
          setIsCreatingVoice(false);
        }
        return;
      }
      setImageUrlCache((prev) => ({ ...prev, [asset.imageId]: asset.imageUrl }));
      consumePick(asset.imageId);
    },
    [subPickerMode, consumePick, t]
  );

  const handleSubPickerSelectMultiple = useCallback(
    (assets: AssetSummary[]) => {
      if (assets.length === 0) return;
      handleSubPickerSelect(assets[0]);
    },
    [handleSubPickerSelect]
  );

  const handleSubmit = useCallback(
    async (payload: ElementEditorSubmitPayload) => {
      const editingId = initialElement?.id ?? null;
      const url = editingId
        ? `/api/elements/${editingId}`
        : "/api/elements";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? payload
        : {
            ...payload,
            projectId,
            collectionId: collectionId ?? null,
            folderId: folderId ?? null,
          };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || t("chat.element.saveFailed"));
      }
      const data = await res.json().catch(() => ({}));
      addToast({
        title: editingId
          ? t("chat.element.updated")
          : t("chat.element.created"),
        color: "success",
      });
      onSaved?.(data?.asset);
    },
    [initialElement, projectId, collectionId, folderId, onSaved, t]
  );

  return (
    <>
      <ElementEditorModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        initialElement={initialElement}
        onRequestPick={handleRequestPick}
        pickedAssetId={pickedAssetId}
        onPickedAssetConsumed={() => setPickedAssetId(null)}
        resolveImageUrl={(id) => imageUrlCache[id]}
        resolveVideoUrl={(id) => videoUrlCache[id]}
        isCreatingVoice={isCreatingVoice}
        onSubmit={handleSubmit}
      />
      <AssetPickerModal
        isOpen={isSubPickerOpen}
        // Editor stays mounted underneath — dismissing the picker just closes
        // the top layer and returns focus to the editor.
        onOpenChange={() => setIsSubPickerOpen(false)}
        onSelect={handleSubPickerSelect}
        onSelectMultiple={handleSubPickerSelectMultiple}
        onUpload={async (files) => {
          const file = files[0];
          if (!file) return;
          // Close the picker immediately; the controller shows its own
          // progress (voice spinner for audio). For image/video, the uploaded
          // id is routed straight into the editor via pickedAssetId.
          setIsSubPickerOpen(false);
          try {
            if (subPickerMode === "voice") {
              setIsCreatingVoice(true);
              const audioRes = await uploadAudio(file, {
                skipCollection: true,
              });
              if (!audioRes.success) {
                addToast({
                  title: audioRes.error.message,
                  color: "danger",
                });
                return;
              }
              const res = await fetch("/api/elements/voice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioId: audioRes.data.audioId }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                addToast({
                  title: err?.error || t("chat.element.voiceCreateFailed"),
                  color: "danger",
                });
                return;
              }
              const { voiceId } = (await res.json()) as { voiceId: string };
              setPickedAssetId(voiceId);
            } else if (subPickerMode === "video") {
              const r = await uploadVideo(file);
              if (!r.success) {
                addToast({ title: r.error.message, color: "danger" });
                return;
              }
              setVideoUrlCache((prev) => ({
                ...prev,
                [r.data.videoId]: r.data.videoUrl,
              }));
              consumePick(r.data.videoId);
            } else {
              const r = await uploadImage(file);
              if (!r.success) {
                addToast({ title: r.error.message, color: "danger" });
                return;
              }
              setImageUrlCache((prev) => ({
                ...prev,
                [r.data.imageId]: r.data.imageUrl,
              }));
              consumePick(r.data.imageId);
            }
          } finally {
            setIsCreatingVoice(false);
          }
        }}
        multiSelect={false}
        acceptTypes={
          subPickerMode === "video"
            ? ["video"]
            : subPickerMode === "voice"
              ? ["audio"]
              : ["image"]
        }
      />
    </>
  );
}
