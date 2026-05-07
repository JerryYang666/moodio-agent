"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { ImagePlus, Film, Mic, X, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ElementAsset } from "@/lib/video/models";

const MAX_IMAGES = 4;
const MAX_NAME_LEN = 255;
const MAX_DESCRIPTION_LEN = 4000;
const MAX_VOICE_ID_LEN = 255;

export interface ElementEditorSubmitPayload {
  name: string;
  description: string;
  imageIds: string[];
  videoId: string | null;
  voiceId: string | null;
}

type PickRequest =
  | { kind: "image"; slot: number } // slot ∈ [0, MAX_IMAGES-1]; existing slot = replace
  | { kind: "image-new" } // append new slot
  | { kind: "video" }
  | { kind: "voice" };

interface ElementEditorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;

  /** When provided, the modal opens in edit mode; when absent, create mode. */
  initialElement?: ElementAsset | null;

  /**
   * Called when the user clicks "Pick image" / "Pick video". The parent is
   * expected to open an asset picker with `acceptTypes: ["image"]` or
   * `["video"]`. When a selection is made, the parent must call
   * {@link ElementEditorModalProps.onAssetPicked} with the chosen id. While
   * a pick is in flight, `pickRequest` is reported via `onPickRequestChange`.
   */
  onRequestPick: (req: PickRequest) => void;

  /**
   * Controlled from the parent: when set to a non-null string, the modal
   * treats it as the resolved id from the outstanding pick request and clears
   * the request. After consumption, the parent should reset this back to
   * null.
   */
  pickedAssetId: string | null;
  onPickedAssetConsumed: () => void;

  /** Submit handler — POST (create) or PATCH (edit) should happen here. */
  onSubmit: (payload: ElementEditorSubmitPayload) => Promise<void>;

  /** Optional URL resolvers for previewing constituents in the modal. */
  resolveImageUrl?: (id: string) => string | undefined;
  resolveVideoUrl?: (id: string) => string | undefined;

  /** True while the controller is calling FAL create-voice. Shows a spinner. */
  isCreatingVoice?: boolean;
}

export default function ElementEditorModal({
  isOpen,
  onOpenChange,
  initialElement,
  onRequestPick,
  pickedAssetId,
  onPickedAssetConsumed,
  onSubmit,
  resolveImageUrl,
  resolveVideoUrl,
  isCreatingVoice = false,
}: ElementEditorModalProps) {
  const t = useTranslations("chat.element");
  const tCommon = useTranslations("common");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [pendingPick, setPendingPick] = useState<PickRequest | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form whenever the modal opens / the initial element changes.
  useEffect(() => {
    if (!isOpen) return;
    setName(initialElement?.name ?? "");
    setDescription(initialElement?.description ?? "");
    setImageIds(initialElement?.imageIds ?? []);
    setVideoId(initialElement?.videoId ?? null);
    setVoiceId(initialElement?.voiceId ?? "");
    setPendingPick(null);
    setIsSaving(false);
    setErrorMessage(null);
  }, [isOpen, initialElement]);

  // Consume a picked asset from the parent.
  useEffect(() => {
    if (!pickedAssetId || !pendingPick) return;

    if (pendingPick.kind === "image") {
      setImageIds((prev) => {
        const next = [...prev];
        next[pendingPick.slot] = pickedAssetId;
        return next;
      });
    } else if (pendingPick.kind === "image-new") {
      setImageIds((prev) =>
        prev.length >= MAX_IMAGES ? prev : [...prev, pickedAssetId]
      );
    } else if (pendingPick.kind === "video") {
      setVideoId(pickedAssetId);
    } else if (pendingPick.kind === "voice") {
      setVoiceId(pickedAssetId);
    }
    setPendingPick(null);
    onPickedAssetConsumed();
  }, [pickedAssetId, pendingPick, onPickedAssetConsumed]);

  const requestPick = useCallback(
    (req: PickRequest) => {
      setPendingPick(req);
      onRequestPick(req);
    },
    [onRequestPick]
  );

  const removeImage = useCallback((index: number) => {
    setImageIds((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const canSave = useMemo(() => {
    if (isSaving) return false;
    if (name.trim().length === 0) return false;
    if (name.length > MAX_NAME_LEN) return false;
    if (description.length > MAX_DESCRIPTION_LEN) return false;
    if (voiceId.length > MAX_VOICE_ID_LEN) return false;
    return true;
  }, [name, description, voiceId, isSaving]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSubmit({
        name: name.trim(),
        description,
        imageIds,
        videoId,
        voiceId: voiceId.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : String(err ?? "Unknown error")
      );
    } finally {
      setIsSaving(false);
    }
  }, [canSave, onSubmit, name, description, imageIds, videoId, voiceId, onOpenChange]);

  const videoUrl = videoId ? resolveVideoUrl?.(videoId) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      scrollBehavior="inside"
      isDismissable={!isSaving}
      classNames={{ base: "max-h-[90vh]" }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Layers size={18} />
          <span>
            {initialElement ? t("editTitle") : t("createTitle")}
          </span>
        </ModalHeader>

        <ModalBody className="space-y-4">
          {/* Today's video models (Kling V3, O3, KSyun Omni, …) only accept
              one mode per element: images OR a video (with optional voice).
              The library row can store both for forward-compat, but at submit
              time the provider picks one — let the user know upfront. */}
          <div className="rounded-md border border-default-200 bg-default-50 px-3 py-2 text-[11px] leading-snug text-default-600">
            {t("modeHint")}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-default-600">
              {t("nameLabel")}
            </label>
            <Input
              value={name}
              onValueChange={setName}
              placeholder={t("namePlaceholder")}
              maxLength={MAX_NAME_LEN}
              isDisabled={isSaving}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-default-600">
              {t("descriptionLabel")}
            </label>
            <Textarea
              value={description}
              onValueChange={setDescription}
              placeholder={t("descriptionPlaceholder")}
              minRows={3}
              maxRows={6}
              maxLength={MAX_DESCRIPTION_LEN}
              isDisabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-default-600">
                {t("imagesLabel", { count: imageIds.length, max: MAX_IMAGES })}
              </label>
              {imageIds.length < MAX_IMAGES && (
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<ImagePlus size={14} />}
                  onPress={() => requestPick({ kind: "image-new" })}
                  isDisabled={isSaving}
                  className="h-7 min-w-0 px-2 text-xs"
                >
                  {t("addImage")}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: MAX_IMAGES }).map((_, i) => {
                const id = imageIds[i];
                const url = id ? resolveImageUrl?.(id) : undefined;
                return (
                  <div
                    key={i}
                    className="relative aspect-square rounded-md border border-divider bg-default-100 overflow-hidden"
                  >
                    {id ? (
                      <>
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-default-400">
                            {id.slice(0, 8)}…
                          </div>
                        )}
                        <button
                          className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/40 flex items-center justify-center text-white text-[11px] transition-opacity z-10"
                          onClick={() =>
                            requestPick({ kind: "image", slot: i })
                          }
                          disabled={isSaving}
                        >
                          {t("replaceImage")}
                        </button>
                        <button
                          className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white hover:bg-danger transition-colors z-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(i);
                          }}
                          disabled={isSaving}
                          aria-label={t("removeImage")}
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="w-full h-full flex items-center justify-center text-default-400 hover:text-default-500 hover:bg-default-200 transition-colors"
                        onClick={() => requestPick({ kind: "image-new" })}
                        disabled={isSaving || imageIds.length >= MAX_IMAGES}
                        aria-label={t("addImage")}
                      >
                        <ImagePlus size={18} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-default-600">
              {t("videoLabel")}
            </label>
            {videoId ? (
              <div className="relative flex items-center gap-3 p-2 rounded-md border border-divider bg-default-50">
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    className="w-20 h-14 object-cover rounded"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="w-20 h-14 rounded bg-default-200 flex items-center justify-center">
                    <Film size={18} className="text-default-400" />
                  </div>
                )}
                <div className="flex-1 text-xs text-default-600 truncate">
                  {videoId}
                </div>
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => setVideoId(null)}
                  isDisabled={isSaving}
                  className="h-7 min-w-0 px-2"
                >
                  {t("removeVideo")}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => requestPick({ kind: "video" })}
                  isDisabled={isSaving}
                  className="h-7 min-w-0 px-2"
                >
                  {t("replaceVideo")}
                </Button>
              </div>
            ) : (
              <Button
                variant="flat"
                startContent={<Film size={16} />}
                onPress={() => requestPick({ kind: "video" })}
                isDisabled={isSaving}
              >
                {t("pickVideo")}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-default-600 flex items-center gap-1">
              <Mic size={12} />
              <span>{t("voiceLabel")}</span>
            </label>
            {isCreatingVoice ? (
              <div className="flex items-center gap-2 rounded-md border border-divider bg-default-50 p-2 text-xs text-default-500">
                <Spinner size="sm" />
                <span>{t("voiceCreating")}</span>
              </div>
            ) : voiceId ? (
              <div className="flex items-center gap-3 p-2 rounded-md border border-divider bg-default-50">
                <div className="flex-1 text-xs">
                  <div className="font-medium text-default-700">
                    {t("voiceReady")}
                  </div>
                  <div className="font-mono text-[10px] text-default-500 truncate">
                    {voiceId}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => setVoiceId("")}
                  isDisabled={isSaving}
                  className="h-7 min-w-0 px-2"
                >
                  {t("removeVoice")}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => requestPick({ kind: "voice" })}
                  isDisabled={isSaving}
                  className="h-7 min-w-0 px-2"
                >
                  {t("replaceVoice")}
                </Button>
              </div>
            ) : (
              <Button
                variant="flat"
                startContent={<Mic size={16} />}
                onPress={() => requestPick({ kind: "voice" })}
                isDisabled={isSaving}
              >
                {t("pickVoice")}
              </Button>
            )}
            <p className="text-[11px] text-default-500">{t("voiceHelp")}</p>
          </div>

          {errorMessage && (
            <div className="text-xs text-danger bg-danger/10 rounded-md p-2">
              {errorMessage}
            </div>
          )}

          {pendingPick && (
            <div className="flex items-center gap-2 text-xs text-default-500">
              <Spinner size="sm" />
              <span>{t("awaitingPicker")}</span>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            variant="flat"
            onPress={() => onOpenChange(false)}
            isDisabled={isSaving}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            color="primary"
            onPress={handleSave}
            isDisabled={!canSave}
            isLoading={isSaving}
          >
            {initialElement ? t("saveEdit") : t("saveCreate")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
