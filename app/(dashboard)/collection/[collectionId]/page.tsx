"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { PERMISSION_OWNER, PERMISSION_COLLABORATOR, hasWriteAccess, isOwner, type Permission, type SharePermission } from "@/lib/permissions";
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
  X,
  Upload,
  Folder,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCollections } from "@/hooks/use-collections";
import ImageDetailModal, {
  ImageInfo,
} from "@/components/chat/image-detail-modal";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";
import AssetPickerModal from "@/components/chat/asset-picker-modal";
import LocationPicker, { type LocationTarget } from "@/components/location-picker";
import AssetPageActions from "@/components/asset-page-actions";
import ElementEditorController from "@/components/chat/element-editor-controller";
import AssetCard from "@/components/asset-card";
import FolderDropCard from "@/components/folder-drop-card";
import { useAssetDragAutoScroll } from "@/hooks/use-asset-drag-autoscroll";
import AssetSearchFilter from "@/components/asset-search-filter";
import BulkSelectionBar from "@/components/bulk-selection-bar";
import VideoDetailModal from "@/components/video-detail-modal";
import AudioDetailModal from "@/components/audio-detail-modal";
import { buildDesktopSendPayload } from "@/lib/utils/desktop-payload";
import { siteConfig } from "@/config/site";
import { uploadImage, validateFile, getMaxFileSizeMB, shouldCompressFile, getCompressThresholdMB } from "@/lib/upload/client";
import { uploadAudio as uploadAudioFile, validateAudioFile } from "@/lib/upload/audio-client";
import { useShareModal } from "@/hooks/use-share-modal";
import ShareModal from "@/components/share-modal";
import type { AssetItem } from "@/lib/types/asset";
import { bulkDownloadAssets } from "@/lib/bulk-download";

interface CollectionData {
  collection: {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    permission: Permission;
    isOwner: boolean;
  };
  folders: Array<{
    id: string;
    name: string;
    collectionId: string;
    depth: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  images: AssetItem[];
  shares: Array<{
    id: string;
    collectionId: string;
    sharedWithUserId: string;
    permission: SharePermission;
    sharedAt: Date;
    email: string;
  }>;
}

const noop = () => {};

export default function CollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = use(params);
  const router = useRouter();
  useAssetDragAutoScroll();
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const tFolders = useTranslations("folders");
  const { collections, renameCollection, deleteCollection, removeItemFromCollection, refreshCollections } =
    useCollections();
  const [collectionData, setCollectionData] = useState<CollectionData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Modals
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
    isOpen: isShareOpen,
    onOpen: onShareOpen,
    onOpenChange: onShareOpenChange,
  } = useDisclosure();
  const {
    isOpen: isCreateFolderOpen,
    onOpen: onCreateFolderOpen,
    onOpenChange: onCreateFolderOpenChange,
  } = useDisclosure();
  const [isCreateElementOpen, setIsCreateElementOpen] = useState(false);
  const [editingElement, setEditingElement] = useState<AssetItem | null>(null);

  const shareModal = useShareModal({
    shareApiPath: `/api/collection/${collectionId}/share`,
    onShareChanged: async () => { await fetchCollectionData(); },
  });
  const {
    isOpen: isImageDetailOpen,
    onOpen: onImageDetailOpen,
    onOpenChange: onImageDetailOpenChange,
    onClose: onImageDetailClose,
  } = useDisclosure();
  const {
    isOpen: isRemoveImageOpen,
    onOpen: onRemoveImageOpen,
    onOpenChange: onRemoveImageOpenChange,
  } = useDisclosure();
  const {
    isOpen: isVideoDetailOpen,
    onOpen: onVideoDetailOpen,
    onOpenChange: onVideoDetailOpenChange,
  } = useDisclosure();
  const {
    isOpen: isAudioDetailOpen,
    onOpen: onAudioDetailOpen,
    onOpenChange: onAudioDetailOpenChange,
  } = useDisclosure();
  const {
    isOpen: isRenameItemOpen,
    onOpen: onRenameItemOpen,
    onOpenChange: onRenameItemOpenChange,
  } = useDisclosure();
  const {
    isOpen: isMoveItemOpen,
    onOpen: onMoveItemOpen,
    onOpenChange: onMoveItemOpenChange,
  } = useDisclosure();
  const {
    isOpen: isCopyItemOpen,
    onOpen: onCopyItemOpen,
    onOpenChange: onCopyItemOpenChange,
  } = useDisclosure();
  const {
    isOpen: isSendToDesktopOpen,
    onOpen: onSendToDesktopOpen,
    onOpenChange: onSendToDesktopOpenChange,
  } = useDisclosure();
  const [desktopSendAsset, setDesktopSendAsset] = useState<AssetItem | null>(null);

  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [assetToRemove, setAssetToRemove] = useState<AssetItem | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<AssetItem | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<AssetItem | null>(null);

  // Rename item state
  const [itemToRename, setItemToRename] = useState<AssetItem | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isRenamingItem, setIsRenamingItem] = useState(false);

  // Move/Copy item state
  const [itemToMove, setItemToMove] = useState<AssetItem | null>(null);
  const [itemToCopy, setItemToCopy] = useState<AssetItem | null>(null);
  const [isMovingItem, setIsMovingItem] = useState(false);
  const [isCopyingItem, setIsCopyingItem] = useState(false);

  // Upload state
  const [isUploadPickerOpen, setIsUploadPickerOpen] = useState(false);
  const toggleUploadPicker = useCallback(() => setIsUploadPickerOpen((v) => !v), []);
  const [isDraggingExternalFile, setIsDraggingExternalFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const dragCounterRef = useRef(0);

  // Asset search filter
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [hoveredRating, setHoveredRating] = useState<{ assetId: string; star: number } | null>(null);
  const [filterRating, setFilterRating] = useState<number | null>(null);

  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const {
    isOpen: isBulkMoveOpen,
    onOpen: onBulkMoveOpen,
    onOpenChange: onBulkMoveOpenChange,
  } = useDisclosure();
  const {
    isOpen: isBulkCopyOpen,
    onOpen: onBulkCopyOpen,
    onOpenChange: onBulkCopyOpenChange,
  } = useDisclosure();
  const {
    isOpen: isBulkDeleteOpen,
    onOpen: onBulkDeleteOpen,
    onOpenChange: onBulkDeleteOpenChange,
  } = useDisclosure();
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isBulkCopying, setIsBulkCopying] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  useEffect(() => {
    fetchCollectionData();
  }, [collectionId]);

  const fetchCollectionData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/collection/${collectionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.push("/collection");
          return;
        }
        throw new Error("Failed to fetch collection");
      }
      const data = await res.json();
      setCollectionData(data);
      setNewName(data.collection.name);
    } catch (error) {
      console.error("Error fetching collection:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    setIsRenaming(true);
    try {
      await renameCollection(collectionId, newName);
      setCollectionData((prev) =>
        prev
          ? {
              ...prev,
              collection: { ...prev.collection, name: newName },
            }
          : null
      );
      onRenameOpenChange();
    } catch (error: any) {
      const msg = error?.status === 409 ? t("duplicateName") : t("renameFailed");
      addToast({ title: t("error"), description: msg, color: "danger" });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleCreateFolder = async (onClose: () => void) => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      const res = await fetch(`/api/collection/${collectionId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        await fetchCollectionData();
        onClose();
        setNewFolderName("");
        addToast({ title: tFolders("folderCreated"), color: "success" });
      }
    } catch {
      addToast({ title: tFolders("failedToCreate"), color: "danger" });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDelete = async () => {
    try {
      const success = await deleteCollection(collectionId);
      if (success) {
        router.push("/collection");
      }
    } catch (error) {
      console.error("Error deleting collection:", error);
    }
  };

  const handleRemoveImage = async () => {
    if (!assetToRemove) return;
    try {
      // Use the unique record id for the API call
      const success = await removeItemFromCollection(
        collectionId,
        assetToRemove.id
      );
      if (success) {
        // Use the unique record id to filter, not imageId (which can be shared by multiple videos)
        setCollectionData((prev) =>
          prev
            ? {
              ...prev,
              images: prev.images.filter(
                (img) => img.id !== assetToRemove.id
              ),
            }
            : null
        );
        onRemoveImageOpenChange();
        setAssetToRemove(null);
      }
    } catch (error) {
      console.error("Error removing image:", error);
    }
  };

  const confirmRemoveImage = (asset: AssetItem) => {
    setAssetToRemove(asset);
    onRemoveImageOpen();
  };

  const handleRenameItem = async () => {
    if (!itemToRename || !newItemTitle.trim()) return;
    setIsRenamingItem(true);
    try {
      // Use the unique record id for the API call
      const res = await fetch(
        `/api/collection/${collectionId}/images/${itemToRename.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newItemTitle.trim() }),
        }
      );

      if (res.ok) {
        // Update local state using unique record id, not imageId
        setCollectionData((prev) =>
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
        addToast({
          title: t("itemRenamed"),
          description: itemToRename.assetType === "video" || itemToRename.assetType === "public_video" ? t("videoRenamedDesc") : t("imageRenamedDesc"),
          color: "success",
        });
        onRenameItemOpenChange();
        setItemToRename(null);
        setNewItemTitle("");
      } else {
        throw new Error("Failed to rename item");
      }
    } catch (error) {
      console.error("Error renaming item:", error);
      addToast({
        title: tCommon("error"),
        description: t("failedToRenameItem"),
        color: "danger",
      });
    } finally {
      setIsRenamingItem(false);
    }
  };

  const openRenameItemModal = (asset: AssetItem) => {
    setItemToRename(asset);
    setNewItemTitle(asset.generationDetails.title);
    onRenameItemOpen();
  };

  const handleDropAssetOnFolder = async (assetId: string, folderId: string) => {
    const asset = collectionData?.images.find((img) => img.id === assetId);
    if (!asset) return;
    setCollectionData((prev) =>
      prev ? { ...prev, images: prev.images.filter((img) => img.id !== assetId) } : null
    );
    try {
      const res = await fetch(`/api/collection/${collectionId}/images/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: [assetId],
          action: "move",
          targetFolderId: folderId,
        }),
      });
      if (!res.ok) throw new Error("Failed to move item");
      addToast({ title: t("itemMoved"), color: "success" });
      refreshCollections();
    } catch {
      setCollectionData((prev) =>
        prev ? { ...prev, images: [...prev.images, asset] } : null
      );
      addToast({
        title: tCommon("error"),
        description: t("failedToMoveItem"),
        color: "danger",
      });
    }
  };

  const handleMoveItem = async (target: LocationTarget) => {
    if (!itemToMove) return;
    setIsMovingItem(true);
    try {
      const body: Record<string, unknown> = { action: "move" };
      if (target.type === "collection") body.targetCollectionId = target.collectionId;
      else body.targetFolderId = target.folderId;

      const res = await fetch(
        `/api/collection/${collectionId}/images/${itemToMove.id}/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        setCollectionData((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.filter(
                  (img) => img.id !== itemToMove.id
                ),
              }
            : null
        );
        addToast({ title: t("itemMoved"), color: "success" });
        onMoveItemOpenChange();
        setItemToMove(null);
        refreshCollections();
      } else {
        throw new Error("Failed to move item");
      }
    } catch (error) {
      console.error("Error moving item:", error);
      addToast({
        title: tCommon("error"),
        description: t("failedToMoveItem"),
        color: "danger",
      });
    } finally {
      setIsMovingItem(false);
    }
  };

  const openMoveItemModal = (asset: AssetItem) => {
    setItemToMove(asset);
    onMoveItemOpen();
  };

  const handleCopyItem = async (target: LocationTarget) => {
    if (!itemToCopy) return;
    setIsCopyingItem(true);
    try {
      const body: Record<string, unknown> = { action: "copy" };
      if (target.type === "collection") body.targetCollectionId = target.collectionId;
      else body.targetFolderId = target.folderId;

      const res = await fetch(
        `/api/collection/${collectionId}/images/${itemToCopy.id}/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        addToast({ title: t("itemCopied"), color: "success" });
        onCopyItemOpenChange();
        setItemToCopy(null);
        refreshCollections();
      } else {
        throw new Error("Failed to copy item");
      }
    } catch (error) {
      console.error("Error copying item:", error);
      addToast({
        title: tCommon("error"),
        description: t("failedToCopyItem"),
        color: "danger",
      });
    } finally {
      setIsCopyingItem(false);
    }
  };

  const openCopyItemModal = (asset: AssetItem) => {
    setItemToCopy(asset);
    onCopyItemOpen();
  };

  // --- Bulk action helpers ---
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

  const handleBulkMove = async (target: LocationTarget) => {
    if (selectedIds.size === 0) return;
    setIsBulkMoving(true);
    try {
      const apiBody: Record<string, unknown> = {
        itemIds: Array.from(selectedIds),
        action: "move",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(
        `/api/collection/${collectionId}/images/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        }
      );
      if (res.ok) {
        setCollectionData((prev) =>
          prev
            ? { ...prev, images: prev.images.filter((img) => !selectedIds.has(img.id)) }
            : null
        );
        addToast({
          title: t("bulkMoved"),
          description: t("bulkMovedDesc", { count: selectedIds.size, collection: "" }),
          color: "success",
        });
        onBulkMoveOpenChange();
        exitSelectionMode();
        refreshCollections();
      } else {
        throw new Error();
      }
    } catch {
      addToast({ title: tCommon("error"), description: t("failedToBulkMove"), color: "danger" });
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkCopy = async (target: LocationTarget) => {
    if (selectedIds.size === 0) return;
    setIsBulkCopying(true);
    try {
      const apiBody: Record<string, unknown> = {
        itemIds: Array.from(selectedIds),
        action: "copy",
      };
      if (target.type === "collection") apiBody.targetCollectionId = target.collectionId;
      else apiBody.targetFolderId = target.folderId;

      const res = await fetch(
        `/api/collection/${collectionId}/images/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        }
      );
      if (res.ok) {
        addToast({
          title: t("bulkCopied"),
          description: t("bulkCopiedDesc", { count: selectedIds.size, collection: "" }),
          color: "success",
        });
        onBulkCopyOpenChange();
        exitSelectionMode();
        refreshCollections();
      } else {
        throw new Error();
      }
    } catch {
      addToast({ title: tCommon("error"), description: t("failedToBulkCopy"), color: "danger" });
    } finally {
      setIsBulkCopying(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await fetch(
        `/api/collection/${collectionId}/images/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemIds: Array.from(selectedIds),
            action: "delete",
          }),
        }
      );
      if (res.ok) {
        setCollectionData((prev) =>
          prev
            ? { ...prev, images: prev.images.filter((img) => !selectedIds.has(img.id)) }
            : null
        );
        addToast({
          title: t("bulkDeleted"),
          description: t("bulkDeletedDesc", { count: selectedIds.size }),
          color: "success",
        });
        onBulkDeleteOpenChange();
        exitSelectionMode();
        refreshCollections();
      } else {
        throw new Error();
      }
    } catch {
      addToast({ title: tCommon("error"), description: t("failedToBulkDelete"), color: "danger" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;
    const selectedAssets = images.filter((a) => selectedIds.has(a.id));
    if (selectedAssets.length === 0) return;
    setIsBulkDownloading(true);
    try {
      const zipName = `${collectionData?.collection.name || "collection"}.zip`;
      await bulkDownloadAssets(selectedAssets, zipName);
      addToast({
        title: t("bulkDownloaded"),
        description: t("bulkDownloadedDesc", { count: selectedAssets.length }),
        color: "success",
      });
    } catch {
      addToast({ title: tCommon("error"), description: t("failedToBulkDownload"), color: "danger" });
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const handleAssetClick = (asset: AssetItem) => {
    if (isSelectionMode) {
      toggleSelection(asset.id);
      return;
    }
    if (asset.assetType === "element") {
      setEditingElement(asset);
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
      // Build allImages array from collection images (only images, not videos)
      const imagesForNav: ImageInfo[] = (collectionData?.images || [])
        .filter((img) => img.assetType === "image" || img.assetType === "public_image")
        .map((img) => ({
          url: img.imageUrl,
          title: img.generationDetails.title,
          prompt: img.generationDetails.prompt,
          status: (
            img.assetType === "public_image" ? "loading" : img.generationDetails.status
          ) as "loading" | "generated" | "error",
          imageId: img.assetType === "public_image" ? undefined : img.imageId,
        }));

      const clickedIndex = imagesForNav.findIndex(
        (img) => (img.imageId ? img.imageId === asset.imageId : img.url === asset.imageUrl)
      );

      setAllImages(imagesForNav);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setSelectedImage({
        url: asset.imageUrl, // Use CloudFront URL from API (signed cookies)
        title: asset.generationDetails.title,
        prompt: asset.generationDetails.prompt,
        status: (
          asset.assetType === "public_image" ? "loading" : asset.generationDetails.status
        ) as "loading" | "generated" | "error",
        imageId: asset.assetType === "public_image" ? undefined : asset.imageId,
      });
      onImageDetailOpen();
    }
  };

  const handleRateAsset = async (asset: AssetItem, newRating: number) => {
    const ratingValue = asset.rating === newRating ? null : newRating;
    setCollectionData((prev) =>
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
        `/api/collection/${collectionId}/images/${asset.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: ratingValue }),
        }
      );
      if (!res.ok) {
        setCollectionData((prev) =>
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
      setCollectionData((prev) =>
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

  const handleImageNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < allImages.length) {
        setCurrentImageIndex(index);
        setSelectedImage(allImages[index]);
      }
    },
    [allImages]
  );

  // Upload files to S3, then add each to the collection
  const uploadFilesToCollection = useCallback(
    async (files: File[]) => {
      // Validate all files first
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

      // Warn if any files will be compressed
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

            // Add the uploaded image to the collection
            const res = await fetch(`/api/collection/${collectionId}/images`, {
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
          fetchCollectionData();
        }
      } finally {
        setIsUploading(false);
        setIsCompressing(false);
      }
    },
    [collectionId, t]
  );

  const uploadAudioFilesToCollection = useCallback(
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
            const result = await uploadAudioFile(file, { skipCollection: true });
            if (!result.success) {
              addToast({ title: t("uploadFailed"), color: "danger" });
              return;
            }

            const res = await fetch(`/api/collection/${collectionId}/images`, {
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
          fetchCollectionData();
        }
      } finally {
        setIsUploading(false);
      }
    },
    [collectionId, t]
  );

  // Handle dropped files on the page
  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingExternalFile(false);
      dragCounterRef.current = 0;

      if (!e.dataTransfer.files.length) return;

      const allowedImageTypes = siteConfig.upload.allowedImageTypes;
      const allowedAudioTypes = siteConfig.upload.allowedAudioTypes;
      const validImageFiles: File[] = [];
      const validAudioFiles: File[] = [];
      let hasInvalid = false;
      for (const file of Array.from(e.dataTransfer.files)) {
        if (allowedImageTypes.includes(file.type)) {
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
        uploadFilesToCollection(validImageFiles);
      }
      if (validAudioFiles.length > 0) {
        uploadAudioFilesToCollection(validAudioFiles);
      }
    },
    [uploadFilesToCollection, t]
  );

  // Global drag listeners for external file drop zone overlay
  useEffect(() => {
    const permission = collectionData?.collection?.permission;
    const userCanAdd = hasWriteAccess(permission);
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types?.includes("Files") ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || !userCanAdd) return;
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDraggingExternalFile(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDraggingExternalFile(false);
      }
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
  }, [collectionData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!collectionData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-default-500">{t("collectionNotFound")}</p>
      </div>
    );
  }

  const { collection, images, shares } = collectionData;
  const canEdit = isOwner(collection.permission);
  const canAddImages = hasWriteAccess(collection.permission);

  // Count images, videos, and audio separately
  const imageCount = images.filter((a) => a.assetType === "image" || a.assetType === "public_image").length;
  const videoCount = images.filter((a) => a.assetType === "video" || a.assetType === "public_video").length;
  const audioCount = images.filter((a) => a.assetType === "audio").length;

  const getAssetCountText = () => {
    const parts = [];
    if (imageCount > 0) {
      parts.push(t("imageCount", { count: imageCount }));
    }
    if (videoCount > 0) {
      parts.push(t("videoCount", { count: videoCount }));
    }
    if (audioCount > 0) {
      parts.push(t("audioCount", { count: audioCount }));
    }
    if (parts.length === 0) {
      return t("noAssets");
    }
    return parts.join(", ");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        {collection.projectId && (
          <Button
            variant="light"
            startContent={<ArrowLeft size={20} />}
            onPress={() => router.push(`/projects/${collection.projectId}`)}
            className="mb-4"
          >
            {t("backToProject")}
          </Button>
        )}

        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 sm:gap-0">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{collection.name}</h1>
              <Chip
                size="sm"
                variant="flat"
                color={collection.isOwner ? "primary" : "default"}
              >
                {collection.permission}
              </Chip>
              <Button
                size="sm"
                variant="flat"
                onPress={() => router.push("/collection")}
              >
                {t("seeAllCollections")}
              </Button>
            </div>
            <p className="text-default-500">{getAssetCountText()}</p>
          </div>

          <AssetPageActions
            hasAssets={images.length > 0}
            canWrite={canAddImages}
            canEdit={canEdit}
            isSelectionMode={isSelectionMode}
            isUploading={isUploading}
            isCompressing={isCompressing}
            onToggleSelection={() => isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)}
            onUpload={() => setIsUploadPickerOpen(true)}
            onCreateFolder={onCreateFolderOpen}
            onCreateElement={() => setIsCreateElementOpen(true)}
            onRename={onRenameOpen}
            onShare={onShareOpen}
            onDelete={onDeleteOpen}
            labels={{
              selectItems: t("selectItems"),
              cancelSelection: t("cancelSelection"),
              uploadImages: t("uploadImages"),
              compressing: t("compressing"),
              newFolder: tFolders("newFolder"),
              newElement: tFolders("newElement"),
              rename: tCommon("rename"),
              share: tCommon("share"),
              delete: tCommon("delete"),
            }}
          />
        </div>
      </div>

      {/* Folders Grid */}
      {collectionData?.folders && collectionData.folders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Folder size={20} />
            {tFolders("folders")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {collectionData.folders.map((folder) => (
              <FolderDropCard
                key={folder.id}
                id={folder.id}
                name={folder.name}
                onOpen={(id) => router.push(`/folder/${id}`)}
                onAssetDrop={canAddImages ? handleDropAssetOnFolder : undefined}
                canAcceptDrop={canAddImages}
              />
            ))}
          </div>
        </div>
      )}

      {/* Assets Grid */}
      {images.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-default-500">{t("noAssetsInCollection")}</p>
        </div>
      ) : (
        <>
          <AssetSearchFilter
            searchQuery={assetSearchQuery}
            onSearchChange={setAssetSearchQuery}
            filterRating={filterRating}
            onFilterRatingChange={setFilterRating}
            labels={{
              searchAssets: t("searchAssets"),
              filterByRating: t("filterByRating"),
            }}
          />
          {(() => {
            let filteredImages = images;
            if (assetSearchQuery.trim()) {
              const q = assetSearchQuery.trim().toLowerCase();
              filteredImages = filteredImages.filter((a) =>
                a.generationDetails.title.toLowerCase().includes(q)
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
                  <p className="text-default-500">{t("noAssetsMatch")}</p>
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
                    canWrite={canAddImages}
                    showChat={collection.isOwner}
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
                      const msgTs = (a.generationDetails as any)?.messageTimestamp;
                      if (msgTs) params.set("messageTimestamp", String(msgTs));
                      router.push(`/chat/${a.chatId}?${params.toString()}`);
                    }}
                    onRemove={confirmRemoveImage}
                    labels={{
                      video: t("video"),
                      element: tFolders("element"),
                      viewDetails: t("viewDetails"),
                      rename: tCommon("rename"),
                      moveTo: t("moveTo"),
                      copyTo: t("copyTo"),
                      sendToDesktop: "Send to Desktop",
                      goToChat: t("goToChat"),
                      remove: t("removeFromCollection"),
                    }}
                  />
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* Floating Bulk Selection Bar */}
      <BulkSelectionBar
        visible={isSelectionMode}
        selectedCount={selectedIds.size}
        isAllSelected={(() => {
          const currentFiltered = images.filter((a) => {
            let pass = true;
            if (assetSearchQuery.trim()) {
              pass = a.generationDetails.title.toLowerCase().includes(assetSearchQuery.trim().toLowerCase());
            }
            if (pass && filterRating !== null) {
              pass = a.rating !== null && a.rating >= filterRating;
            }
            return pass;
          });
          return currentFiltered.length > 0 && currentFiltered.every((a) => selectedIds.has(a.id));
        })()}
        onToggleSelectAll={() => {
          const currentFiltered = images.filter((a) => {
            let pass = true;
            if (assetSearchQuery.trim()) {
              pass = a.generationDetails.title.toLowerCase().includes(assetSearchQuery.trim().toLowerCase());
            }
            if (pass && filterRating !== null) {
              pass = a.rating !== null && a.rating >= filterRating;
            }
            return pass;
          });
          const allSelected = currentFiltered.every((a) => selectedIds.has(a.id));
          if (allSelected) {
            setSelectedIds(new Set());
          } else {
            setSelectedIds(new Set(currentFiltered.map((a) => a.id)));
          }
        }}
        onCopy={onBulkCopyOpen}
        onMove={onBulkMoveOpen}
        onDelete={onBulkDeleteOpen}
        onDownload={handleBulkDownload}
        isDownloading={isBulkDownloading}
        labels={{
          selectedCount: t("selectedCount", { count: selectedIds.size }),
          selectAll: t("selectAll"),
          deselectAll: t("deselectAll"),
          bulkCopyTo: t("bulkCopyTo"),
          bulkMoveTo: t("bulkMoveTo"),
          bulkDelete: t("bulkDelete"),
          bulkDownload: t("bulkDownload"),
        }}
      />

      {/* Bulk Move */}
      <LocationPicker
        isOpen={isBulkMoveOpen}
        onOpenChange={(open) => { if (!open) onBulkMoveOpenChange(); }}
        title={t("bulkMoveToCollection", { count: selectedIds.size })}
        confirmLabel={t("move")}
        isLoading={isBulkMoving}
        excludeCollectionId={collectionId}
        onConfirm={handleBulkMove}
      />

      {/* Bulk Copy */}
      <LocationPicker
        isOpen={isBulkCopyOpen}
        onOpenChange={(open) => { if (!open) onBulkCopyOpenChange(); }}
        title={t("bulkCopyToCollection", { count: selectedIds.size })}
        confirmLabel={t("copy")}
        isLoading={isBulkCopying}
        onConfirm={handleBulkCopy}
      />

      {/* Bulk Delete Confirmation Modal */}
      <Modal isOpen={isBulkDeleteOpen} onOpenChange={onBulkDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("bulkDeleteItems", { count: selectedIds.size })}</ModalHeader>
              <ModalBody>
                <p>{t("bulkDeleteConfirm", { count: selectedIds.size })}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
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
              <ModalHeader>{t("renameCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("collectionName")}
                  value={newName}
                  onValueChange={setNewName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleRename();
                    }
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
                  onPress={handleRename}
                  isLoading={isRenaming}
                  isDisabled={!newName.trim()}
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
              <ModalHeader>{t("deleteCollection")}</ModalHeader>
              <ModalBody>
                <p>
                  {t("deleteCollectionConfirm")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button color="danger" onPress={handleDelete}>
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onOpenChange={onShareOpenChange}
        title={t("shareCollection")}
        ownerId={collection.userId}
        shares={shares}
        share={shareModal}
        publicShareConfig={{ resourceType: "collection", resourceId: collectionId }}
        hasWriteAccess={canAddImages}
      />

      <ElementEditorController
        isOpen={isCreateElementOpen}
        onOpenChange={setIsCreateElementOpen}
        projectId={collection.projectId ?? undefined}
        collectionId={collectionId}
        onSaved={() => {
          setIsCreateElementOpen(false);
          fetchCollectionData();
        }}
      />

      <ElementEditorController
        isOpen={editingElement !== null}
        onOpenChange={(open) => {
          if (!open) setEditingElement(null);
        }}
        projectId={collection.projectId ?? undefined}
        collectionId={collectionId}
        initialElement={
          editingElement?.elementDetails
            ? {
                id: editingElement.elementDetails.id,
                name: editingElement.elementDetails.name,
                description: editingElement.elementDetails.description,
                imageIds: editingElement.elementDetails.imageIds,
                videoId: editingElement.elementDetails.videoId,
                voiceId: editingElement.elementDetails.voiceId,
                voiceProvider: editingElement.elementDetails.voiceProvider,
              }
            : null
        }
        initialImageUrls={
          editingElement?.elementDetails
            ? Object.fromEntries(
                (editingElement.elementDetails.imageIds ?? []).map((id, i) => [
                  id,
                  editingElement.elementDetails!.imageUrls?.[i] ?? "",
                ])
              )
            : undefined
        }
        initialVideoUrl={
          editingElement?.elementDetails?.videoId &&
          editingElement.elementDetails.videoUrl
            ? {
                id: editingElement.elementDetails.videoId,
                url: editingElement.elementDetails.videoUrl,
              }
            : undefined
        }
        onSaved={() => {
          setEditingElement(null);
          fetchCollectionData();
        }}
      />

      {/* Remove Image Confirmation Modal */}
      <Modal isOpen={isRemoveImageOpen} onOpenChange={onRemoveImageOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("removeImage")}</ModalHeader>
              <ModalBody>
                <p>
                  {t("removeImageConfirm")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button color="danger" onPress={handleRemoveImage}>
                  {t("remove")}
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
          videoDetails: t("videoDetails"),
          untitledVideo: t("untitledVideo"),
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
              <ModalHeader>{itemToRename?.assetType === "video" || itemToRename?.assetType === "public_video" ? t("renameVideo") : t("renameImage")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("itemTitle")}
                  value={newItemTitle}
                  onValueChange={setNewItemTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleRenameItem();
                    }
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

      {/* Move Item */}
      <LocationPicker
        isOpen={isMoveItemOpen}
        onOpenChange={(open) => { if (!open) onMoveItemOpenChange(); }}
        title={t("moveToCollection")}
        confirmLabel={t("move")}
        isLoading={isMovingItem}
        excludeCollectionId={collectionId}
        onConfirm={handleMoveItem}
      />

      {/* Copy Item */}
      <LocationPicker
        isOpen={isCopyItemOpen}
        onOpenChange={(open) => { if (!open) onCopyItemOpenChange(); }}
        title={t("copyToCollection")}
        confirmLabel={t("copy")}
        isLoading={isCopyingItem}
        onConfirm={handleCopyItem}
      />

      {/* Send to Desktop Modal */}
      <SendToDesktopModal
        isOpen={isSendToDesktopOpen}
        onOpenChange={onSendToDesktopOpenChange}
        assets={
          desktopSendAsset && desktopSendAsset.assetType !== "element"
            ? [
                buildDesktopSendPayload(desktopSendAsset) as {
                  assetType:
                    | "image"
                    | "video"
                    | "public_video"
                    | "public_image"
                    | "audio";
                  metadata: Record<string, unknown>;
                },
              ]
            : []
        }
      />

      {/* Create Folder Modal */}
      <Modal isOpen={isCreateFolderOpen} onOpenChange={onCreateFolderOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{tFolders("createFolder")}</ModalHeader>
              <ModalBody>
                <Input
                  label={tFolders("folderName")}
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

      {/* Drop zone overlay for external file drag */}
      <AnimatePresence>
        {isDraggingExternalFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleFileDrop}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="w-full max-w-xl rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-md p-10 flex flex-col items-center gap-3 shadow-xl">
                <Upload size={40} className="text-primary" />
                <span className="text-xl font-semibold text-primary">
                  {t("dropZoneTitle")}
                </span>
                <span className="text-sm text-default-500">
                  {t("dropZoneSubtitle", { maxSize: siteConfig.upload.maxFileSizeMB })}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload picker modal (upload-only, no library tab) */}
      <AssetPickerModal
        isOpen={isUploadPickerOpen}
        onOpenChange={toggleUploadPicker}
        onSelect={noop}
        onUpload={(files) => {
          const audioTypes = siteConfig.upload.allowedAudioTypes;
          const imageFiles = files.filter((f) => !audioTypes.includes(f.type));
          const audioFiles = files.filter((f) => audioTypes.includes(f.type));
          if (imageFiles.length > 0) uploadFilesToCollection(imageFiles);
          if (audioFiles.length > 0) uploadAudioFilesToCollection(audioFiles);
        }}
        hideLibraryTab
        acceptTypes={["image", "video", "audio"]}
      />
    </div>
  );
}
