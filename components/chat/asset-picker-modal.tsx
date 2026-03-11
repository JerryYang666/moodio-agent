"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { type Permission } from "@/lib/permissions";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";
import { Image } from "@heroui/image";
import { Card, CardBody } from "@heroui/card";
import { Tab, Tabs } from "@heroui/tabs";
import { Search, Expand, Camera, Star, X, Check } from "lucide-react";
import { siteConfig } from "@/config/site";

export type AssetSummary = {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  imageUrl: string;
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  rating?: number | null;
  addedAt: Date;
};

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
};

type Collection = {
  id: string;
  name: string;
  projectId: string;
  isOwner: boolean;
  permission: Permission;
};

export default function AssetPickerModal({
  isOpen,
  onOpenChange,
  onSelect,
  onSelectMultiple,
  onUpload,
  hideLibraryTab = false,
  multiSelect = false,
  maxSelectCount,
}: {
  isOpen: boolean;
  onOpenChange: () => void;
  onSelect: (asset: AssetSummary) => void;
  /** Called with all selected assets when multiSelect is enabled and user confirms */
  onSelectMultiple?: (assets: AssetSummary[]) => void;
  onUpload: (files: File[]) => void;
  /** When true, only shows the upload tab (hides the library picker) */
  hideLibraryTab?: boolean;
  /** Enable multiselect mode in the library tab */
  multiSelect?: boolean;
  /** Max number of images that can be selected (multiSelect mode) */
  maxSelectCount?: number;
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [projectId, setProjectId] = useState<string>("recent");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [tabKey, setTabKey] = useState<"library" | "upload" | "camera">("library");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetSummary | null>(null);

  // Multiselect state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);

  // Star filter state
  const [filterRating, setFilterRating] = useState<number | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewAsset(null);
      setSelectedIds(new Set());
      lastClickedIndexRef.current = null;
      setFilterRating(null);
      stopCamera();
      setCapturedPhoto(null);
      return;
    }
    setTabKey(hideLibraryTab ? "upload" : "library");
    setUploadError(null);
    const load = async () => {
      setLoading(true);
      try {
        const [projectsRes, collectionsRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/collection"),
        ]);
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(data.projects || []);
        }
        if (collectionsRes.ok) {
          const data = await collectionsRes.json();
          setCollections(data.collections || []);
        }
      } catch (e) {
        console.error("Failed to load picker metadata", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  // Stop camera when switching away from camera tab
  useEffect(() => {
    if (tabKey !== "camera") {
      stopCamera();
      setCapturedPhoto(null);
    }
  }, [tabKey]);

  const visibleCollections = useMemo(() => {
    const all = collections;
    if (projectId === "recent") return all;
    return all.filter((c) => c.projectId === projectId);
  }, [collections, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    const loadAssets = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "80");
        if (collectionId !== "all") {
          params.set("collectionId", collectionId);
        } else if (projectId !== "recent") {
          params.set("projectId", projectId);
        }
        const res = await fetch(`/api/assets?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setAssets(data.assets || []);
      } catch (e) {
        console.error("Failed to load assets", e);
      } finally {
        setLoading(false);
      }
    };
    loadAssets();
  }, [isOpen, projectId, collectionId]);

  const filteredAssets = useMemo(() => {
    let result = assets;
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((a) =>
        (a.generationDetails?.title || "").toLowerCase().includes(q)
      );
    }
    if (filterRating !== null) {
      result = result.filter(
        (a) => a.rating !== null && a.rating !== undefined && a.rating >= filterRating
      );
    }
    return result;
  }, [assets, query, filterRating]);

  const selectedAssets = useMemo(() => {
    return assets.filter((a) => selectedIds.has(a.id));
  }, [assets, selectedIds]);

  // Camera functions
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(t("assetPicker.cameraAccessDenied"));
      setCameraActive(false);
    }
  }, [t]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedPhoto(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const useCapturedPhoto = useCallback(
    async (onClose: () => void) => {
      if (!capturedPhoto) return;
      const res = await fetch(capturedPhoto);
      const blob = await res.blob();
      const file = new File([blob], `camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onUpload([file]);
      setCapturedPhoto(null);
      onClose();
    },
    [capturedPhoto, onUpload]
  );

  // Multiselect handlers
  const handleAssetClick = useCallback(
    (asset: AssetSummary, index: number, e: React.MouseEvent) => {
      if (!multiSelect) {
        onSelect(asset);
        onOpenChange();
        return;
      }

      // Shift+click: select range
      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index);
        const end = Math.max(lastClickedIndexRef.current, index);
        const rangeIds = filteredAssets.slice(start, end + 1).map((a) => a.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of rangeIds) {
            if (maxSelectCount && next.size >= maxSelectCount && !next.has(id)) continue;
            next.add(id);
          }
          return next;
        });
        lastClickedIndexRef.current = index;
        return;
      }

      // Toggle single selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(asset.id)) {
          next.delete(asset.id);
        } else {
          if (maxSelectCount && next.size >= maxSelectCount) return prev;
          next.add(asset.id);
        }
        return next;
      });
      lastClickedIndexRef.current = index;
    },
    [multiSelect, filteredAssets, maxSelectCount, onSelect, onOpenChange]
  );

  const handleConfirmSelection = useCallback(
    (onClose: () => void) => {
      if (onSelectMultiple) {
        onSelectMultiple(selectedAssets);
      } else {
        // Fallback: call onSelect for each
        for (const asset of selectedAssets) {
          onSelect(asset);
        }
      }
      onClose();
    },
    [selectedAssets, onSelect, onSelectMultiple]
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="4xl"
        scrollBehavior="inside"
        classNames={{ base: "max-h-[90dvh]" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div>{t("assetPicker.title")}</div>
                <Tabs
                  selectedKey={tabKey}
                  onSelectionChange={(k) => setTabKey(k as "library" | "upload" | "camera")}
                  size="sm"
                  variant="underlined"
                >
                  {!hideLibraryTab && (
                    <Tab key="library" title={t("assetPicker.libraryTab")} />
                  )}
                  <Tab key="upload" title={t("assetPicker.uploadTab")} />
                  <Tab key="camera" title={t("assetPicker.cameraTab")} />
                </Tabs>
              </ModalHeader>

              <ModalBody className="overflow-hidden">
                {tabKey === "camera" ? (
                  /* ── Camera Tab ── */
                  <div className="flex flex-col gap-4 items-center">
                    {cameraError && (
                      <div className="text-sm text-danger text-center py-4">
                        {cameraError}
                      </div>
                    )}

                    {capturedPhoto ? (
                      /* Show captured photo preview */
                      <div className="flex flex-col items-center gap-4 w-full">
                        <div className="relative rounded-lg overflow-hidden border border-divider max-w-lg w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={capturedPhoto}
                            alt={t("assetPicker.capturedPhoto")}
                            className="w-full h-auto"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="flat"
                            onPress={() => {
                              setCapturedPhoto(null);
                              startCamera();
                            }}
                          >
                            {t("assetPicker.retakePhoto")}
                          </Button>
                          <Button
                            color="primary"
                            onPress={() => useCapturedPhoto(onClose)}
                          >
                            {t("assetPicker.usePhoto")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Camera viewfinder */
                      <div className="flex flex-col items-center gap-4 w-full">
                        <div className="relative rounded-lg overflow-hidden border border-divider bg-black max-w-lg w-full aspect-video">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                          <canvas ref={canvasRef} className="hidden" />
                        </div>
                        {!cameraActive ? (
                          <Button
                            color="primary"
                            startContent={<Camera size={16} />}
                            onPress={startCamera}
                          >
                            {t("assetPicker.startCamera")}
                          </Button>
                        ) : (
                          <Button
                            color="primary"
                            size="lg"
                            isIconOnly
                            className="rounded-full w-16 h-16 border-4 border-white shadow-lg"
                            onPress={capturePhoto}
                            title={t("assetPicker.takePhoto")}
                          >
                            <Camera size={24} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : tabKey === "upload" ? (
                  /* ── Upload Tab ── */
                  <div className="flex flex-col gap-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/png, image/jpeg, image/webp, image/gif"
                      multiple
                      onChange={(e) => {
                        const fileList = e.target.files;
                        if (!fileList || fileList.length === 0) return;
                        const maxBytes = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
                        const validTypes = siteConfig.upload.allowedImageTypes;
                        const validFiles: File[] = [];
                        for (const file of Array.from(fileList)) {
                          if (file.size > maxBytes) {
                            setUploadError(t("assetPicker.uploadTooLarge", { maxSize: siteConfig.upload.maxFileSizeMB }));
                            e.currentTarget.value = "";
                            return;
                          }
                          if (!validTypes.includes(file.type)) {
                            setUploadError(t("assetPicker.uploadUnsupportedType"));
                            e.currentTarget.value = "";
                            return;
                          }
                          validFiles.push(file);
                        }
                        setUploadError(null);
                        onUpload(validFiles);
                        onClose();
                        e.currentTarget.value = "";
                      }}
                    />

                    <div className="rounded-xl border border-divider bg-default-50 p-4">
                      <div className="font-medium">
                        {t("assetPicker.uploadFromDevice")}
                      </div>
                      <div className="text-sm text-default-500 mt-1">
                        {t("assetPicker.uploadDescription", { maxSize: siteConfig.upload.maxFileSizeMB })}
                      </div>
                      {uploadError && (
                        <div className="text-xs text-danger mt-2">
                          {uploadError}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button
                          color="primary"
                          onPress={() => fileInputRef.current?.click()}
                        >
                          {t("assetPicker.chooseFile")}
                        </Button>
                        {!hideLibraryTab && (
                          <Button
                            variant="flat"
                            onPress={() => setTabKey("library")}
                          >
                            {t("assetPicker.browseLibrary")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Library Tab ── */
                  <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex flex-col md:flex-row gap-3 shrink-0">
                      <Select
                        label={t("assetPicker.projectLabel")}
                        selectedKeys={[projectId]}
                        onChange={(e) => {
                          const next = e.target.value;
                          setProjectId(next);
                          setCollectionId("all");
                        }}
                        className="md:w-1/2"
                      >
                        <SelectItem key="recent">
                          {t("assetPicker.recent")}
                        </SelectItem>
                        <>
                          {projects.map((p) => (
                            <SelectItem key={p.id}>
                              {p.isDefault
                                ? `${p.name} (${t("assetPicker.defaultSuffix")})`
                                : p.name}
                            </SelectItem>
                          ))}
                        </>
                      </Select>

                      <Select
                        label={t("assetPicker.collectionLabel")}
                        selectedKeys={[collectionId]}
                        onChange={(e) => setCollectionId(e.target.value)}
                        className="md:w-1/2"
                      >
                        <SelectItem key="all">{t("assetPicker.all")}</SelectItem>
                        <>
                          {visibleCollections.map((c) => (
                            <SelectItem key={c.id}>
                              {c.isOwner
                                ? c.name
                                : `${c.name} (${t("assetPicker.sharedSuffix")})`}
                            </SelectItem>
                          ))}
                        </>
                      </Select>
                    </div>

                    {/* Search + Star filter row */}
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <Input
                        startContent={
                          <Search size={16} className="text-default-400" />
                        }
                        placeholder={t("assetPicker.searchByTitle")}
                        value={query}
                        onValueChange={setQuery}
                        className="flex-1 min-w-[180px]"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-default-500 mr-0.5">
                          {t("assetPicker.filterByRating")}:
                        </span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            className="p-0.5 leading-none cursor-pointer"
                            onClick={() =>
                              setFilterRating(filterRating === star ? null : star)
                            }
                          >
                            <Star
                              size={16}
                              className={
                                filterRating !== null && star <= filterRating
                                  ? "text-yellow-400 fill-yellow-400"
                                  : "text-default-300"
                              }
                            />
                          </button>
                        ))}
                        {filterRating !== null && (
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            onPress={() => setFilterRating(null)}
                            className="min-w-6 w-6 h-6"
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    </div>

                    {loading ? (
                      <div className="flex items-center justify-center py-10">
                        <Spinner />
                      </div>
                    ) : filteredAssets.length === 0 ? (
                      <div className="text-center py-10 text-default-500">
                        {t("assetPicker.noAssetsFound")}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {filteredAssets.map((a, index) => {
                            const isSelected = selectedIds.has(a.id);
                            return (
                              <Card
                                key={a.id}
                                className={`group relative ${multiSelect && isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                              >
                                <CardBody className="p-0 overflow-hidden aspect-square relative rounded-lg">
                                  <button
                                    className="w-full h-full"
                                    onClick={(e) => handleAssetClick(a, index, e)}
                                  >
                                    <Image
                                      src={a.imageUrl}
                                      alt={
                                        a.generationDetails?.title ||
                                        t("assetPicker.assetAlt")
                                      }
                                      radius="none"
                                      classNames={{
                                        wrapper: "w-full h-full !max-w-full",
                                        img: `w-full h-full object-cover transition-opacity ${multiSelect && isSelected ? "opacity-80" : ""}`,
                                      }}
                                    />
                                  </button>

                                  {/* Selection checkbox overlay */}
                                  {multiSelect && (
                                    <div
                                      className="absolute top-2 left-2 z-20 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAssetClick(a, index, e as unknown as React.MouseEvent);
                                      }}
                                    >
                                      <div
                                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                          isSelected
                                            ? "bg-primary text-white"
                                            : "bg-background/80 backdrop-blur-sm border border-default-300"
                                        }`}
                                      >
                                        {isSelected && <Check size={14} />}
                                      </div>
                                    </div>
                                  )}

                                  {/* Expand button */}
                                  <button
                                    className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewAsset(a);
                                    }}
                                    title={t("assetPicker.viewFull")}
                                  >
                                    <Expand size={14} />
                                  </button>

                                  {/* Bottom overlay: title + star rating (collection style) */}
                                  <div className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/70 to-transparent pt-6 pb-1.5 px-2 pointer-events-none">
                                    <p className="text-xs text-white truncate">
                                      {a.generationDetails?.title ||
                                        t("assetPicker.untitled")}
                                    </p>
                                    <div className="flex gap-0.5 mt-0.5">
                                      {[1, 2, 3, 4, 5].map((star) => {
                                        const filled =
                                          star <= (a.rating ?? 0);
                                        return (
                                          <Star
                                            key={star}
                                            size={12}
                                            className={
                                              filled
                                                ? "text-yellow-400 fill-yellow-400"
                                                : "text-white/50"
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                </CardBody>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                {multiSelect && tabKey === "library" && selectedIds.size > 0 ? (
                  <>
                    <span className="text-sm text-default-500 mr-auto">
                      {t("assetPicker.selectedCount", { count: selectedIds.size })}
                      {maxSelectCount
                        ? ` / ${maxSelectCount}`
                        : ""}
                    </span>
                    <Button variant="light" onPress={onClose}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => handleConfirmSelection(onClose)}
                    >
                      {t("assetPicker.confirmSelection")}
                    </Button>
                  </>
                ) : (
                  <Button variant="light" onPress={onClose}>
                    {t("common.close")}
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Full image preview modal */}
      <Modal
        isOpen={!!previewAsset}
        onOpenChange={() => setPreviewAsset(null)}
        size="5xl"
        classNames={{
          base: "bg-black/95",
          closeButton: "text-white hover:bg-white/20",
        }}
      >
        <ModalContent>
          {(onPreviewClose) => (
            <>
              <ModalHeader className="text-white flex items-center justify-between">
                <span className="truncate pr-4">
                  {previewAsset?.generationDetails?.title ||
                    t("assetPicker.untitled")}
                </span>
              </ModalHeader>
              <ModalBody className="flex items-center justify-center p-4">
                {previewAsset && (
                  <Image
                    src={previewAsset.imageUrl}
                    alt={
                      previewAsset.generationDetails?.title ||
                      t("assetPicker.assetAlt")
                    }
                    classNames={{
                      wrapper: "max-w-full max-h-[70vh]",
                      img: "max-w-full max-h-[70vh] object-contain",
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter className="justify-center gap-2">
                <Button
                  variant="flat"
                  className="text-white"
                  onPress={onPreviewClose}
                >
                  {t("common.close")}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    if (previewAsset) {
                      if (multiSelect) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(previewAsset.id)) {
                            next.delete(previewAsset.id);
                          } else {
                            if (maxSelectCount && next.size >= maxSelectCount) return prev;
                            next.add(previewAsset.id);
                          }
                          return next;
                        });
                        setPreviewAsset(null);
                      } else {
                        onSelect(previewAsset);
                        setPreviewAsset(null);
                        onOpenChange();
                      }
                    }
                  }}
                >
                  {multiSelect
                    ? previewAsset && selectedIds.has(previewAsset.id)
                      ? t("assetPicker.deselectThisImage")
                      : t("assetPicker.selectThisImage")
                    : t("assetPicker.selectThisImage")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
