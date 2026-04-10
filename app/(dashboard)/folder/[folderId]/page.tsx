"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import {
  hasWriteAccess,
  isOwner as isOwnerCheck,
  type Permission,
  type SharePermission,
} from "@/lib/permissions";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import {
  Pencil,
  Trash2,
  ArrowLeft,
  Folder,
  ChevronRight,
  Upload,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ImageDetailModal, {
  ImageInfo,
} from "@/components/chat/image-detail-modal";
import AssetPickerModal from "@/components/chat/asset-picker-modal";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";
import { useShareModal } from "@/hooks/use-share-modal";
import ShareModal from "@/components/share-modal";
import LocationPicker, { type LocationTarget } from "@/components/location-picker";
import AssetPageActions from "@/components/asset-page-actions";
import AssetCard from "@/components/asset-card";
import AssetSearchFilter from "@/components/asset-search-filter";
import BulkSelectionBar from "@/components/bulk-selection-bar";
import VideoDetailModal from "@/components/video-detail-modal";
import AudioDetailModal from "@/components/audio-detail-modal";
import { uploadAudio as uploadAudioFile, validateAudioFile } from "@/lib/upload/audio-client";
import { buildDesktopSendPayload } from "@/lib/utils/desktop-payload";
import { siteConfig } from "@/config/site";
import { uploadImage, validateFile, getMaxFileSizeMB, shouldCompressFile, getCompressThresholdMB } from "@/lib/upload/client";
import { useTranslations } from "next-intl";
import type { AssetItem } from "@/lib/types/asset";

interface FolderInfo {
  id: string;
  userId: string;
  collectionId: string;
  parentId: string | null;
  name: string;
  path: string;
  depth: number;
  permission: Permission;
  isOwner: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ChildFolder {
  id: string;
  name: string;
  collectionId: string;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BreadcrumbItem {
  id: string;
  name: string;
  type: "collection" | "folder";
}

interface FolderData {
  folder: FolderInfo;
  collection: { id: string; name: string; projectId: string } | null;
  childFolders: ChildFolder[];
  images: AssetItem[];
  shares: Array<{
    id: string;
    folderId: string;
    sharedWithUserId: string;
    permission: string;
    sharedAt: Date;
    email: string;
  }>;
}

export default function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = use(params);
  const router = useRouter();
  const t = useTranslations("folders");
  const tCommon = useTranslations("common");
  const tCollections = useTranslations("collections");
  const [folderData, setFolderData] = useState<FolderData | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Upload state
  const [isUploadPickerOpen, setIsUploadPickerOpen] = useState(false);
  const toggleUploadPicker = useCallback(() => setIsUploadPickerOpen((v) => !v), []);
  const [isDraggingExternalFile, setIsDraggingExternalFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const dragCounterRef = useRef(0);

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Single item actions
  const [itemToMove, setItemToMove] = useState<AssetItem | null>(null);
  const [itemToCopy, setItemToCopy] = useState<AssetItem | null>(null);
  const [assetToRemove, setAssetToRemove] = useState<AssetItem | null>(null);
  const [isMovingItem, setIsMovingItem] = useState(false);
  const [isCopyingItem, setIsCopyingItem] = useState(false);

  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onOpenChange: onDeleteOpenChange,
  } = useDisclosure();
  const {
    isOpen: isCreateFolderOpen,
    onOpen: onCreateFolderOpen,
    onOpenChange: onCreateFolderOpenChange,
  } = useDisclosure();
  const {
    isOpen: isShareOpen,
    onOpen: onShareOpen,
    onOpenChange: onShareOpenChange,
  } = useDisclosure();
  const {
    isOpen: isImageDetailOpen,
    onOpen: onImageDetailOpen,
    onOpenChange: onImageDetailOpenChange,
    onClose: onImageDetailClose,
  } = useDisclosure();
  const {
    isOpen: isRemoveAssetOpen,
    onOpen: onRemoveAssetOpen,
    onOpenChange: onRemoveAssetOpenChange,
    onClose: onRemoveAssetClose,
  } = useDisclosure();
  const {
    isOpen: isMoveItemOpen,
    onOpen: onMoveItemOpen,
    onOpenChange: onMoveItemOpenChange,
    onClose: onMoveItemClose,
  } = useDisclosure();
  const {
    isOpen: isCopyItemOpen,
    onOpen: onCopyItemOpen,
    onOpenChange: onCopyItemOpenChange,
    onClose: onCopyItemClose,
  } = useDisclosure();
  const {
    isOpen: isBulkMoveOpen,
    onOpen: onBulkMoveOpen,
    onOpenChange: onBulkMoveOpenChange,
    onClose: onBulkMoveClose,
  } = useDisclosure();
  const {
    isOpen: isBulkCopyOpen,
    onOpen: onBulkCopyOpen,
    onOpenChange: onBulkCopyOpenChange,
    onClose: onBulkCopyClose,
  } = useDisclosure();
  const {
    isOpen: isBulkDeleteOpen,
    onOpen: onBulkDeleteOpen,
    onOpenChange: onBulkDeleteOpenChange,
    onClose: onBulkDeleteClose,
  } = useDisclosure();
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isBulkCopying, setIsBulkCopying] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const shareModal = useShareModal({
    shareApiPath: `/api/folders/${folderId}/share`,
    onShareChanged: async () => {
      await fetchFolderData();
    },
  });

  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Search & filter
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [hoveredRating, setHoveredRating] = useState<{ assetId: string; star: number } | null>(null);
  const [filterRating, setFilterRating] = useState<number | null>(null);

  // Video detail
  const {
    isOpen: isVideoDetailOpen,
    onOpen: onVideoDetailOpen,
    onOpenChange: onVideoDetailOpenChange,
  } = useDisclosure();
  const [selectedVideo, setSelectedVideo] = useState<AssetItem | null>(null);

  // Audio detail
  const {
    isOpen: isAudioDetailOpen,
    onOpen: onAudioDetailOpen,
    onOpenChange: onAudioDetailOpenChange,
  } = useDisclosure();
  const [selectedAudio, setSelectedAudio] = useState<AssetItem | null>(null);

  // Rename item
  const {
    isOpen: isRenameItemOpen,
    onOpen: onRenameItemOpen,
    onOpenChange: onRenameItemOpenChange,
  } = useDisclosure();
  const [itemToRename, setItemToRename] = useState<AssetItem | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isRenamingItem, setIsRenamingItem] = useState(false);

  // Send to desktop
  const {
    isOpen: isSendToDesktopOpen,
    onOpen: onSendToDesktopOpen,
    onOpenChange: onSendToDesktopOpenChange,
  } = useDisclosure();
  const [desktopSendAsset, setDesktopSendAsset] = useState<AssetItem | null>(null);

  const fetchFolderData = useCallback(async () => {
    try {
      const [folderRes, breadcrumbRes] = await Promise.all([
        fetch(`/api/folders/${folderId}`),
        fetch(`/api/folders/${folderId}/breadcrumbs`),
      ]);

      if (!folderRes.ok) {
        router.push("/");
        return;
      }

      const data: FolderData = await folderRes.json();
      setFolderData(data);

      if (breadcrumbRes.ok) {
        const bcData = await breadcrumbRes.json();
        setBreadcrumbs(bcData.breadcrumbs || []);
        setProjectId(bcData.projectId || null);
      }
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [folderId, router]);

  useEffect(() => {
    fetchFolderData();
  }, [fetchFolderData]);

  useEffect(() => {
    if (folderData) {
      const imgs: ImageInfo[] = folderData.images
        .filter(
          (a) =>
            a.assetType === "image" ||
            a.assetType === "public_image"
        )
        .map((a) => ({
          imageId: a.imageId,
          url: a.imageUrl,
          prompt: a.generationDetails?.prompt || "",
          title: a.generationDetails?.title || "",
        }));
      setAllImages(imgs);
    }
  }, [folderData]);

  const canWrite = folderData
    ? hasWriteAccess(folderData.folder.permission)
    : false;
  const ownerAccess = folderData
    ? isOwnerCheck(folderData.folder.permission)
    : false;

  const handleRename = async (onClose: () => void) => {
    if (!newName.trim()) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        await fetchFolderData();
        onClose();
        addToast({ title: t("folderRenamed"), color: "success" });
      }
    } catch {
      addToast({ title: t("failedToRename"), color: "danger" });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async (onClose: () => void) => {
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onClose();
        addToast({ title: t("folderDeleted"), color: "success" });
        // Navigate back to parent
        if (folderData?.folder.parentId) {
          router.push(`/folder/${folderData.folder.parentId}`);
        } else if (folderData?.folder.collectionId) {
          router.push(`/collection/${folderData.folder.collectionId}`);
        } else {
          router.push("/");
        }
      }
    } catch {
      addToast({ title: t("failedToDelete"), color: "danger" });
    }
  };

  const handleCreateFolder = async (onClose: () => void) => {
    if (!newFolderName.trim() || !folderData) return;
    setIsCreatingFolder(true);
    try {
      const res = await fetch(
        `/api/collection/${folderData.folder.collectionId}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newFolderName.trim(),
            parentId: folderId,
          }),
        }
      );
      if (res.ok) {
        await fetchFolderData();
        onClose();
        setNewFolderName("");
        addToast({ title: t("folderCreated"), color: "success" });
      }
    } catch {
      addToast({ title: t("failedToCreate"), color: "danger" });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleAssetClick = (asset: AssetItem) => {
    if (isSelectionMode) {
      toggleSelection(asset.id);
      return;
    }
    if (asset.assetType === "audio") {
      setSelectedAudio(asset);
      onAudioDetailOpen();
      return;
    }
    if (asset.assetType === "video" || asset.assetType === "public_video") {
      setSelectedVideo(asset);
      onVideoDetailOpen();
    } else {
      const imgInfo: ImageInfo = {
        imageId: asset.imageId,
        url: asset.imageUrl,
        prompt: asset.generationDetails?.prompt || "",
        title: asset.generationDetails?.title || "",
      };
      setSelectedImage(imgInfo);
      const idx = allImages.findIndex((i) => i.imageId === asset.imageId);
      setCurrentImageIndex(idx >= 0 ? idx : 0);
      onImageDetailOpen();
    }
  };

  const handleImageNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < allImages.length) {
        setCurrentImageIndex(index);
        setSelectedImage(allImages[index]);
      }
    },
    [allImages]
  );

  const handleRateAsset = async (asset: AssetItem, newRating: number) => {
    const ratingValue = asset.rating === newRating ? null : newRating;
    setFolderData((prev) =>
      prev
        ? {
            ...prev,
            images: prev.images.map((img) =>
              img.id === asset.id ? { ...img, rating: ratingValue } : img
            ),
          }
        : null
    );
    try {
      const res = await fetch(
        `/api/collection/${folderData?.folder.collectionId}/images/${asset.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: ratingValue }),
        }
      );
      if (!res.ok) {
        setFolderData((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((img) =>
                  img.id === asset.id ? { ...img, rating: asset.rating } : img
                ),
              }
            : null
        );
      }
    } catch {
      setFolderData((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.map((img) =>
                img.id === asset.id ? { ...img, rating: asset.rating } : img
              ),
            }
          : null
      );
    }
  };

  const openRenameItemModal = (asset: AssetItem) => {
    setItemToRename(asset);
    setNewItemTitle(asset.generationDetails?.title || "");
    onRenameItemOpen();
  };

  const handleRenameItem = async () => {
    if (!itemToRename || !newItemTitle.trim() || !folderData) return;
    setIsRenamingItem(true);
    try {
      const res = await fetch(
        `/api/collection/${folderData.folder.collectionId}/images/${itemToRename.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newItemTitle.trim() }),
        }
      );
      if (res.ok) {
        setFolderData((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((img) =>
                  img.id === itemToRename.id
                    ? {
                        ...img,
                        generationDetails: {
                          ...img.generationDetails,
                          title: newItemTitle.trim(),
                        },
                      }
                    : img
                ),
              }
            : null
        );
        addToast({ title: tCollections("itemRenamed"), color: "success" });
        onRenameItemOpenChange();
        setItemToRename(null);
        setNewItemTitle("");
      }
    } catch {
      addToast({ title: tCollections("failedToRenameItem"), color: "danger" });
    } finally {
      setIsRenamingItem(false);
    }
  };

  const handleVideoDownload = async (asset: AssetItem) => {
    if (!asset.videoUrl) return;
    try {
      const response = await fetch(asset.videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-${asset.assetId}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error:", e);
    }
  };

  const handleAudioDownload = async (asset: AssetItem) => {
    if (!asset.audioUrl) return;
    try {
      const filename = `audio-${asset.assetId}`;
      const downloadUrl = `/api/audio/${encodeURIComponent(asset.assetId)}/download?filename=${encodeURIComponent(filename)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Audio download error:", e);
    }
  };

  // Upload
  const uploadFilesToFolder = useCallback(
    async (files: File[]) => {
      const allowedTypes = siteConfig.upload.allowedImageTypes;
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          addToast({
            title:
              validationError.code === "FILE_TOO_LARGE"
                ? t("fileSizeTooLarge", { maxSize: getMaxFileSizeMB() })
                : t("uploadFailed"),
            color: "danger",
          });
          return;
        }
        if (!allowedTypes.includes(file.type)) {
          addToast({ title: t("invalidImageType"), color: "warning" });
          return;
        }
      }

      setIsUploading(true);
      let successCount = 0;
      const hasLargeFiles = files.some((f) => shouldCompressFile(f));
      if (hasLargeFiles) {
        addToast({
          title: t("fileWillBeCompressed", { threshold: getCompressThresholdMB() }),
          color: "warning",
        });
      }

      try {
        await Promise.all(
          files.map(async (file) => {
            const result = await uploadImage(file, {
              skipCollection: true,
              onPhaseChange: (phase) => {
                if (phase === "compressing") setIsCompressing(true);
              },
            });
            if (!result.success) {
              addToast({ title: t("uploadFailed"), color: "danger" });
              return;
            }
            const res = await fetch(`/api/folders/${folderId}/images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageId: result.data.imageId,
                generationDetails: {
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  prompt: "",
                  status: "generated",
                },
              }),
            });
            if (res.ok) {
              successCount++;
            } else {
              addToast({ title: t("uploadFailed"), color: "danger" });
            }
          })
        );
        if (successCount > 0) {
          addToast({
            title: t("imagesUploaded", { count: successCount }),
            color: "success",
          });
          fetchFolderData();
        }
      } finally {
        setIsUploading(false);
        setIsCompressing(false);
      }
    },
    [folderId, t, fetchFolderData]
  );

  const uploadAudioFilesToFolder = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const err = validateAudioFile(file);
        if (err) {
          addToast({ title: err.message, color: "danger" });
          return;
        }
      }
      setIsUploading(true);
      let successCount = 0;
      try {
        await Promise.all(
          files.map(async (file) => {
            const result = await uploadAudioFile(file);
            if (!result.success) {
              addToast({ title: t("uploadFailed"), color: "danger" });
              return;
            }
            const res = await fetch(`/api/folders/${folderId}/images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageId: "audio-file-placeholder",
                assetId: result.data.audioId,
                assetType: "audio",
                generationDetails: {
                  title: file.name.replace(/\.[^/.]+$/, ""),
                  prompt: "",
                  status: "generated",
                },
              }),
            });
            if (res.ok) successCount++;
            else addToast({ title: t("uploadFailed"), color: "danger" });
          })
        );
        if (successCount > 0) {
          addToast({ title: t("imagesUploaded", { count: successCount }), color: "success" });
          fetchFolderData();
        }
      } finally {
        setIsUploading(false);
      }
    },
    [folderId, t]
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingExternalFile(false);
      dragCounterRef.current = 0;
      if (!e.dataTransfer.files.length) return;
      const allowedTypes = siteConfig.upload.allowedImageTypes;
      const allowedAudioTypes = siteConfig.upload.allowedAudioTypes;
      const validImageFiles: File[] = [];
      const validAudioFiles: File[] = [];
      let hasInvalid = false;
      for (const file of Array.from(e.dataTransfer.files)) {
        if (allowedTypes.includes(file.type)) {
          validImageFiles.push(file);
        } else if (allowedAudioTypes.includes(file.type)) {
          validAudioFiles.push(file);
        } else {
          hasInvalid = true;
        }
      }
      if (hasInvalid) {
        addToast({ title: t("invalidImageType"), color: "warning" });
      }
      if (validImageFiles.length > 0) {
        uploadFilesToFolder(validImageFiles);
      }
      if (validAudioFiles.length > 0) {
        uploadAudioFilesToFolder(validAudioFiles);
      }
    },
    [uploadFilesToFolder, uploadAudioFilesToFolder, t]
  );

  useEffect(() => {
    const permission = folderData?.folder?.permission;
    const userCanAdd = hasWriteAccess(permission);
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types?.includes("Files") ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || !userCanAdd) return;
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) setIsDraggingExternalFile(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) setIsDraggingExternalFile(false);
    };
    const onDrop = () => {
      dragCounterRef.current = 0;
      setIsDraggingExternalFile(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      dragCounterRef.current = 0;
    };
  }, [folderData]);

  // Selection helpers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Single item move/copy
  const openMoveItemModal = (asset: AssetItem) => {
    setItemToMove(asset);
    onMoveItemOpen();
  };
  const openCopyItemModal = (asset: AssetItem) => {
    setItemToCopy(asset);
    onCopyItemOpen();
  };
  const confirmRemoveAsset = (asset: AssetItem) => {
    setAssetToRemove(asset);
    onRemoveAssetOpen();
  };

  const handleMoveItem = async (target: LocationTarget) => {
    if (!itemToMove || !folderData) return;
    setIsMovingItem(true);
    try {
      const body: Record<string, string> = {
        itemIds: JSON.stringify([itemToMove.id]),
        action: "move",
      };
      const apiBody: Record<string, unknown> = {
        itemIds: [itemToMove.id],
        action: "move",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      if (res.ok) {
        setFolderData((prev) =>
          prev ? { ...prev, images: prev.images.filter((img) => img.id !== itemToMove.id) } : null
        );
        addToast({ title: t("itemMoved"), color: "success" });
        onMoveItemClose();
        setItemToMove(null);
      } else {
        addToast({ title: t("failedToMove"), color: "danger" });
      }
    } catch {
      addToast({ title: t("failedToMove"), color: "danger" });
    } finally {
      setIsMovingItem(false);
    }
  };

  const handleCopyItem = async (target: LocationTarget) => {
    if (!itemToCopy || !folderData) return;
    setIsCopyingItem(true);
    try {
      const apiBody: Record<string, unknown> = {
        itemIds: [itemToCopy.id],
        action: "copy",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      if (res.ok) {
        addToast({ title: t("itemCopied"), color: "success" });
        onCopyItemClose();
        setItemToCopy(null);
      } else {
        addToast({ title: t("failedToCopy"), color: "danger" });
      }
    } catch {
      addToast({ title: t("failedToCopy"), color: "danger" });
    } finally {
      setIsCopyingItem(false);
    }
  };

  const handleRemoveAsset = async () => {
    if (!assetToRemove) return;
    try {
      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [assetToRemove.id], action: "delete" }),
      });
      if (res.ok) {
        setFolderData((prev) =>
          prev ? { ...prev, images: prev.images.filter((img) => img.id !== assetToRemove.id) } : null
        );
        addToast({ title: t("assetRemoved"), color: "success" });
        onRemoveAssetClose();
        setAssetToRemove(null);
      }
    } catch {
      addToast({ title: t("failedToRemove"), color: "danger" });
    }
  };

  // Bulk actions
  const handleBulkMove = async (target: LocationTarget) => {
    setIsBulkMoving(true);
    try {
      const apiBody: Record<string, unknown> = {
        itemIds: Array.from(selectedIds),
        action: "move",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      if (res.ok) {
        setFolderData((prev) =>
          prev ? { ...prev, images: prev.images.filter((img) => !selectedIds.has(img.id)) } : null
        );
        addToast({ title: t("bulkMoved", { count: selectedIds.size }), color: "success" });
        onBulkMoveClose();
        exitSelectionMode();
      } else {
        addToast({ title: t("failedToMove"), color: "danger" });
      }
    } catch {
      addToast({ title: t("failedToMove"), color: "danger" });
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkCopy = async (target: LocationTarget) => {
    setIsBulkCopying(true);
    try {
      const apiBody: Record<string, unknown> = {
        itemIds: Array.from(selectedIds),
        action: "copy",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      if (res.ok) {
        addToast({ title: t("bulkCopied", { count: selectedIds.size }), color: "success" });
        onBulkCopyClose();
        exitSelectionMode();
      } else {
        addToast({ title: t("failedToCopy"), color: "danger" });
      }
    } catch {
      addToast({ title: t("failedToCopy"), color: "danger" });
    } finally {
      setIsBulkCopying(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(selectedIds), action: "delete" }),
      });
      if (res.ok) {
        setFolderData((prev) =>
          prev ? { ...prev, images: prev.images.filter((img) => !selectedIds.has(img.id)) } : null
        );
        addToast({ title: t("bulkDeleted", { count: selectedIds.size }), color: "success" });
        onBulkDeleteClose();
        exitSelectionMode();
      } else {
        addToast({ title: t("failedToDelete"), color: "danger" });
      }
    } catch {
      addToast({ title: t("failedToDelete"), color: "danger" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!folderData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-default-500">{t("folderNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-default-500 mb-4 flex-wrap">
        {projectId && (
          <>
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="hover:text-foreground transition-colors"
            >
              {t("project")}
            </button>
            <ChevronRight size={14} />
          </>
        )}
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} />}
            {i === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium">{crumb.name}</span>
            ) : (
              <button
                onClick={() =>
                  router.push(
                    crumb.type === "collection"
                      ? `/collection/${crumb.id}`
                      : `/folder/${crumb.id}`
                  )
                }
                className="hover:text-foreground transition-colors"
              >
                {crumb.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 sm:gap-0 mb-6">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            variant="light"
            onPress={() => {
              if (folderData.folder.parentId) {
                router.push(`/folder/${folderData.folder.parentId}`);
              } else {
                router.push(
                  `/collection/${folderData.folder.collectionId}`
                );
              }
            }}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Folder size={24} />
              {folderData.folder.name}
              {!ownerAccess && (
                <Chip size="sm" variant="flat" color="primary">
                  {folderData.folder.permission}
                </Chip>
              )}
            </h1>
          </div>
        </div>
        <AssetPageActions
          hasAssets={folderData.images.length > 0}
          canWrite={canWrite}
          canEdit={ownerAccess}
          isSelectionMode={isSelectionMode}
          isUploading={isUploading}
          isCompressing={isCompressing}
          onToggleSelection={() => isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)}
          onUpload={toggleUploadPicker}
          onCreateFolder={onCreateFolderOpen}
          onRename={() => {
            setNewName(folderData.folder.name);
            onRenameOpen();
          }}
          onShare={onShareOpen}
          onDelete={onDeleteOpen}
          labels={{
            selectItems: t("selectItems"),
            cancelSelection: t("cancelSelection"),
            uploadImages: t("uploadImages"),
            compressing: t("compressing"),
            newFolder: t("newFolder"),
            rename: t("rename"),
            share: t("share"),
            delete: t("delete"),
          }}
        />
      </div>

      {/* Sub-folders grid */}
      {folderData.childFolders.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{t("folders")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folderData.childFolders.map((child) => (
              <Card
                key={child.id}
                isPressable
                onPress={() => router.push(`/folder/${child.id}`)}
                className="hover:bg-default-100 transition-colors"
              >
                <CardBody className="flex flex-row items-center gap-3 py-3">
                  <Folder size={20} className="text-default-500 shrink-0" />
                  <span className="font-medium truncate">{child.name}</span>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Assets */}
      {folderData.images.length === 0 && folderData.childFolders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-default-400">
          <Folder size={48} className="mb-4" />
          <p>{t("emptyFolder")}</p>
          {canWrite && (
            <Button
              variant="flat"
              startContent={<Upload size={16} />}
              className="mt-4"
              onPress={toggleUploadPicker}
            >
              {t("uploadImages")}
            </Button>
          )}
        </div>
      ) : folderData.images.length > 0 ? (
        <>
          <AssetSearchFilter
            searchQuery={assetSearchQuery}
            onSearchChange={setAssetSearchQuery}
            filterRating={filterRating}
            onFilterRatingChange={setFilterRating}
            labels={{
              searchAssets: tCollections("searchAssets"),
              filterByRating: tCollections("filterByRating"),
            }}
          />
          {(() => {
            let filteredImages = folderData.images;
            if (assetSearchQuery.trim()) {
              const q = assetSearchQuery.trim().toLowerCase();
              filteredImages = filteredImages.filter((a) =>
                (a.generationDetails?.title || "").toLowerCase().includes(q)
              );
            }
            if (filterRating !== null) {
              filteredImages = filteredImages.filter(
                (a) => a.rating !== null && a.rating >= filterRating
              );
            }

            if (filteredImages.length === 0) {
              return (
                <div className="text-center py-20">
                  <p className="text-default-500">{tCollections("noAssetsMatch")}</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredImages.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedIds.has(asset.id)}
                    canWrite={canWrite}
                    showChat={ownerAccess}
                    hoveredRating={hoveredRating}
                    onHoverRating={setHoveredRating}
                    onClick={handleAssetClick}
                    onToggleSelection={toggleSelection}
                    onRate={handleRateAsset}
                    onRename={openRenameItemModal}
                    onMove={openMoveItemModal}
                    onCopy={openCopyItemModal}
                    onDesktop={(a) => { setDesktopSendAsset(a); onSendToDesktopOpen(); }}
                    onChat={(a) => {
                      const params = new URLSearchParams();
                      params.set("assetId", a.imageId);
                      router.push(`/chat/${a.chatId}?${params.toString()}`);
                    }}
                    onRemove={confirmRemoveAsset}
                    labels={{
                      video: tCollections("video"),
                      viewDetails: t("viewDetails"),
                      rename: tCommon("rename"),
                      moveTo: t("moveTo"),
                      copyTo: t("copyTo"),
                      sendToDesktop: "Send to Desktop",
                      goToChat: tCollections("goToChat"),
                      remove: t("removeFromFolder"),
                    }}
                  />
                ))}
              </div>
            );
          })()}
        </>
      ) : null}

      {/* Floating Bulk Selection Bar */}
      <BulkSelectionBar
        visible={isSelectionMode}
        selectedCount={selectedIds.size}
        isAllSelected={(() => {
          const currentFiltered = folderData.images.filter((a) => {
            let pass = true;
            if (assetSearchQuery.trim()) {
              pass = (a.generationDetails?.title || "").toLowerCase().includes(assetSearchQuery.trim().toLowerCase());
            }
            if (pass && filterRating !== null) {
              pass = a.rating !== null && a.rating >= filterRating;
            }
            return pass;
          });
          return currentFiltered.length > 0 && currentFiltered.every((a) => selectedIds.has(a.id));
        })()}
        onToggleSelectAll={() => {
          const currentFiltered = folderData.images.filter((a) => {
            let pass = true;
            if (assetSearchQuery.trim()) {
              pass = (a.generationDetails?.title || "").toLowerCase().includes(assetSearchQuery.trim().toLowerCase());
            }
            if (pass && filterRating !== null) {
              pass = a.rating !== null && a.rating >= filterRating;
            }
            return pass;
          });
          const allSelected = currentFiltered.every((a) => selectedIds.has(a.id));
          if (allSelected) setSelectedIds(new Set());
          else setSelectedIds(new Set(currentFiltered.map((a) => a.id)));
        }}
        onCopy={onBulkCopyOpen}
        onMove={onBulkMoveOpen}
        onDelete={onBulkDeleteOpen}
        labels={{
          selectedCount: t("selectedCount", { count: selectedIds.size }),
          selectAll: t("selectAll"),
          deselectAll: t("deselectAll"),
          bulkCopyTo: t("bulkCopyTo"),
          bulkMoveTo: t("bulkMoveTo"),
          bulkDelete: t("bulkDelete"),
        }}
      />

      {/* Drag-and-drop overlay */}
      <AnimatePresence>
        {isDraggingExternalFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <div className="border-2 border-dashed border-primary rounded-2xl p-12 flex flex-col items-center gap-3">
              <Upload size={48} className="text-primary" />
              <p className="text-lg font-medium">{t("dropFilesHere")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Picker Modal */}
      <AssetPickerModal
        isOpen={isUploadPickerOpen}
        onOpenChange={toggleUploadPicker}
        onSelect={() => {}}
        onUpload={(files) => {
          setIsUploadPickerOpen(false);
          uploadFilesToFolder(files);
        }}
        hideLibraryTab
      />

      {/* Remove Asset Confirmation */}
      <Modal isOpen={isRemoveAssetOpen} onOpenChange={onRemoveAssetOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("removeFromFolder")}</ModalHeader>
              <ModalBody>
                <p>{t("removeFromFolderConfirm")}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button color="danger" onPress={handleRemoveAsset}>
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Single Move */}
      <LocationPicker
        isOpen={isMoveItemOpen}
        onOpenChange={(open) => { if (!open) onMoveItemClose(); }}
        title={t("moveTo")}
        confirmLabel={tCommon("move")}
        isLoading={isMovingItem}
        excludeFolderId={folderId}
        onConfirm={handleMoveItem}
      />

      {/* Single Copy */}
      <LocationPicker
        isOpen={isCopyItemOpen}
        onOpenChange={(open) => { if (!open) onCopyItemClose(); }}
        title={t("copyTo")}
        confirmLabel={tCommon("copy")}
        isLoading={isCopyingItem}
        onConfirm={handleCopyItem}
      />

      {/* Bulk Move */}
      <LocationPicker
        isOpen={isBulkMoveOpen}
        onOpenChange={(open) => { if (!open) onBulkMoveClose(); }}
        title={t("bulkMoveTitle", { count: selectedIds.size })}
        confirmLabel={tCommon("move")}
        isLoading={isBulkMoving}
        excludeFolderId={folderId}
        onConfirm={handleBulkMove}
      />

      {/* Bulk Copy */}
      <LocationPicker
        isOpen={isBulkCopyOpen}
        onOpenChange={(open) => { if (!open) onBulkCopyClose(); }}
        title={t("bulkCopyTitle", { count: selectedIds.size })}
        confirmLabel={tCommon("copy")}
        isLoading={isBulkCopying}
        onConfirm={handleBulkCopy}
      />

      {/* Bulk Delete Confirmation */}
      <Modal isOpen={isBulkDeleteOpen} onOpenChange={onBulkDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("bulkDeleteTitle", { count: selectedIds.size })}</ModalHeader>
              <ModalBody>
                <p>{t("bulkDeleteConfirm", { count: selectedIds.size })}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="danger"
                  onPress={handleBulkDelete}
                  isLoading={isBulkDeleting}
                >
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={isRenameOpen} onOpenChange={onRenameOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("renameFolder")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("folderName")}
                  value={newName}
                  onValueChange={setNewName}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(onClose);
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={() => handleRename(onClose)}
                  isLoading={isRenaming}
                >
                  {tCommon("rename")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("deleteFolder")}</ModalHeader>
              <ModalBody>
                <p>
                  {t("deleteConfirm", { name: folderData.folder.name })}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="danger"
                  onPress={() => handleDelete(onClose)}
                >
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        isOpen={isCreateFolderOpen}
        onOpenChange={onCreateFolderOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("createSubFolder")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("folderName")}
                  value={newFolderName}
                  onValueChange={setNewFolderName}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder(onClose);
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={() => handleCreateFolder(onClose)}
                  isLoading={isCreatingFolder}
                >
                  {tCommon("create")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Image Detail Modal */}
      <ImageDetailModal
        isOpen={isImageDetailOpen}
        onOpenChange={onImageDetailOpenChange}
        selectedImage={selectedImage}
        allImages={allImages}
        currentIndex={currentImageIndex}
        onNavigate={handleImageNavigate}
        onClose={onImageDetailClose}
      />

      {/* Video Detail Modal */}
      <VideoDetailModal
        isOpen={isVideoDetailOpen}
        onOpenChange={onVideoDetailOpenChange}
        asset={selectedVideo}
        onDownload={handleVideoDownload}
        labels={{
          videoDetails: tCollections("videoDetails"),
          untitledVideo: tCollections("untitledVideo"),
          download: tCommon("download"),
          close: tCommon("close"),
        }}
      />

      {/* Audio Detail Modal */}
      <AudioDetailModal
        isOpen={isAudioDetailOpen}
        onOpenChange={onAudioDetailOpenChange}
        asset={selectedAudio}
        onDownload={handleAudioDownload}
        labels={{
          audioDetails: t("audioDetails"),
          untitledAudio: t("untitledAudio"),
          download: tCommon("download"),
          close: tCommon("close"),
        }}
      />

      {/* Rename Item Modal */}
      <Modal isOpen={isRenameItemOpen} onOpenChange={onRenameItemOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {itemToRename?.assetType === "video" || itemToRename?.assetType === "public_video"
                  ? tCollections("renameVideo")
                  : tCollections("renameImage")}
              </ModalHeader>
              <ModalBody>
                <Input
                  label={tCollections("itemTitle")}
                  value={newItemTitle}
                  onValueChange={setNewItemTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameItem();
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleRenameItem}
                  isLoading={isRenamingItem}
                  isDisabled={!newItemTitle.trim()}
                >
                  {tCommon("rename")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Send to Desktop Modal */}
      <SendToDesktopModal
        isOpen={isSendToDesktopOpen}
        onOpenChange={onSendToDesktopOpenChange}
        assets={desktopSendAsset ? [buildDesktopSendPayload(desktopSendAsset)] : []}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onOpenChange={onShareOpenChange}
        title={t("shareFolder")}
        ownerId={folderData.folder.userId}
        shares={folderData.shares.map((s) => ({
          id: s.id,
          sharedWithUserId: s.sharedWithUserId,
          permission: s.permission as SharePermission,
          sharedAt: s.sharedAt,
          email: s.email,
        }))}
        share={shareModal}
        publicShareConfig={{ resourceType: "folder", resourceId: folderId }}
        hasWriteAccess={canWrite}
      />
    </div>
  );
}
