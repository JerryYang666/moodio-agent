"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import { Select, SelectItem } from "@heroui/select";
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
  Share2,
  ArrowLeft,
  X,
  MoreVertical,
  Eye,
  MessageSquare,
  Play,
  Video,
  Download,
  Move,
  Copy,
} from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import ImageDetailModal, {
  ImageInfo,
} from "@/components/chat/image-detail-modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";

interface CollectionAsset {
  id: string;
  collectionId: string;
  imageId: string; // Thumbnail/display image ID
  assetId: string; // Actual asset ID (same as imageId for images, video ID for videos)
  assetType: "image" | "video";
  imageUrl: string; // CloudFront URL for thumbnail (access via signed cookies)
  videoUrl?: string; // CloudFront URL for video (only for videos)
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error" | "pending" | "processing" | "completed" | "failed";
    imageUrl?: string;
    videoUrl?: string;
  };
  addedAt: Date;
}

interface CollectionData {
  collection: {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    permission: "owner" | "collaborator" | "viewer";
    isOwner: boolean;
  };
  images: CollectionAsset[];
  shares: Array<{
    id: string;
    collectionId: string;
    sharedWithUserId: string;
    permission: "viewer" | "collaborator";
    sharedAt: Date;
    email: string;
  }>;
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export default function CollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = use(params);
  const router = useRouter();
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const { collections, renameCollection, deleteCollection, removeItemFromCollection, refreshCollections } =
    useCollections();
  const [collectionData, setCollectionData] = useState<CollectionData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

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

  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [assetToRemove, setAssetToRemove] = useState<CollectionAsset | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<CollectionAsset | null>(null);

  // Rename item state
  const [itemToRename, setItemToRename] = useState<CollectionAsset | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isRenamingItem, setIsRenamingItem] = useState(false);

  // Move/Copy item state
  const [itemToMove, setItemToMove] = useState<CollectionAsset | null>(null);
  const [itemToCopy, setItemToCopy] = useState<CollectionAsset | null>(null);
  const [selectedTargetCollection, setSelectedTargetCollection] = useState<string>("");
  const [isMovingItem, setIsMovingItem] = useState(false);
  const [isCopyingItem, setIsCopyingItem] = useState(false);

  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selectedPermission, setSelectedPermission] = useState<
    "viewer" | "collaborator"
  >("viewer");
  const [isSharing, setIsSharing] = useState(false);

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

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return;
    setIsSearching(true);
    setSearchError("");
    setSearchedUser(null);

    try {
      const res = await fetch(
        `/api/users/search?email=${encodeURIComponent(searchEmail.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setSearchedUser(data.user);
        } else {
          setSearchError("User not found");
        }
      } else {
        setSearchError("Failed to search user");
      }
    } catch (error) {
      console.error("Error searching user:", error);
      setSearchError("Error searching user");
    } finally {
      setIsSearching(false);
    }
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    setIsRenaming(true);
    try {
      const success = await renameCollection(collectionId, newName);
      if (success) {
        setCollectionData((prev) =>
          prev
            ? {
              ...prev,
              collection: { ...prev.collection, name: newName },
            }
            : null
        );
        onRenameOpenChange();
      }
    } catch (error) {
      console.error("Error renaming collection:", error);
    } finally {
      setIsRenaming(false);
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

  const confirmRemoveImage = (asset: CollectionAsset) => {
    setAssetToRemove(asset);
    onRemoveImageOpen();
  };

  const handleShare = async () => {
    if (!searchedUser) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/collection/${collectionId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserId: searchedUser.id,
          permission: selectedPermission,
        }),
      });

      if (res.ok) {
        await fetchCollectionData();
        setSearchEmail("");
        setSearchedUser(null);
        setSelectedPermission("viewer");
        // Keep modal open to show updated list or add more
      }
    } catch (error) {
      console.error("Error sharing collection:", error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveShare = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/collection/${collectionId}/share/${userId}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        await fetchCollectionData();
      }
    } catch (error) {
      console.error("Error removing share:", error);
    }
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
          description: itemToRename.assetType === "video" ? t("videoRenamedDesc") : t("imageRenamedDesc"),
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

  const openRenameItemModal = (asset: CollectionAsset) => {
    setItemToRename(asset);
    setNewItemTitle(asset.generationDetails.title);
    onRenameItemOpen();
  };

  const handleMoveItem = async () => {
    if (!itemToMove || !selectedTargetCollection) return;
    setIsMovingItem(true);
    try {
      // Use the unique record id for the API call
      const res = await fetch(
        `/api/collection/${collectionId}/images/${itemToMove.id}/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            targetCollectionId: selectedTargetCollection,
            action: "move"
          }),
        }
      );

      if (res.ok) {
        // Get target collection name for toast
        const targetCollection = availableCollections.find(
          (col) => col.id === selectedTargetCollection
        );
        // Remove from local state using unique record id, not imageId
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
        addToast({
          title: t("itemMoved"),
          description: itemToMove.assetType === "video" 
            ? t("videoMovedDesc", { collection: targetCollection?.name || "collection" })
            : t("imageMovedDesc", { collection: targetCollection?.name || "collection" }),
          color: "success",
        });
        onMoveItemOpenChange();
        setItemToMove(null);
        setSelectedTargetCollection("");
        // Refresh collections to update counts
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

  const openMoveItemModal = (asset: CollectionAsset) => {
    setItemToMove(asset);
    setSelectedTargetCollection("");
    onMoveItemOpen();
  };

  const handleCopyItem = async () => {
    if (!itemToCopy || !selectedTargetCollection) return;
    setIsCopyingItem(true);
    try {
      // Use the unique record id for the API call
      const res = await fetch(
        `/api/collection/${collectionId}/images/${itemToCopy.id}/transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            targetCollectionId: selectedTargetCollection,
            action: "copy"
          }),
        }
      );

      if (res.ok) {
        // Get target collection name for toast
        const targetCollection = availableCollections.find(
          (col) => col.id === selectedTargetCollection
        );
        addToast({
          title: t("itemCopied"),
          description: itemToCopy.assetType === "video"
            ? t("videoCopiedDesc", { collection: targetCollection?.name || "collection" })
            : t("imageCopiedDesc", { collection: targetCollection?.name || "collection" }),
          color: "success",
        });
        onCopyItemOpenChange();
        setItemToCopy(null);
        setSelectedTargetCollection("");
        // Refresh collections to update counts
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

  const openCopyItemModal = (asset: CollectionAsset) => {
    setItemToCopy(asset);
    setSelectedTargetCollection("");
    onCopyItemOpen();
  };

  // Get available collections for move/copy (exclude current collection)
  const availableCollections = collections.filter(
    (col) =>
      col.id !== collectionId &&
      (col.permission === "owner" || col.permission === "collaborator")
  );

  const handleAssetClick = (asset: CollectionAsset) => {
    if (asset.assetType === "video") {
      // Open video detail modal
      setSelectedVideo(asset);
      onVideoDetailOpen();
    } else {
      // Build allImages array from collection images (only images, not videos)
      const imagesForNav: ImageInfo[] = (collectionData?.images || [])
        .filter((img) => img.assetType === "image")
        .map((img) => ({
          url: img.imageUrl,
          title: img.generationDetails.title,
          prompt: img.generationDetails.prompt,
          status: img.generationDetails.status as "loading" | "generated" | "error",
          imageId: img.imageId,
        }));

      const clickedIndex = imagesForNav.findIndex(
        (img) => img.imageId === asset.imageId
      );

      setAllImages(imagesForNav);
      setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setSelectedImage({
        url: asset.imageUrl, // Use CloudFront URL from API (signed cookies)
        title: asset.generationDetails.title,
        prompt: asset.generationDetails.prompt,
        status: asset.generationDetails.status as "loading" | "generated" | "error",
        imageId: asset.imageId,
      });
      onImageDetailOpen();
    }
  };

  const handleVideoDownload = async (asset: CollectionAsset) => {
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

  const handleImageNavigate = useCallback(
    (index: number) => {
      if (index >= 0 && index < allImages.length) {
        setCurrentImageIndex(index);
        setSelectedImage(allImages[index]);
      }
    },
    [allImages]
  );

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
  const canEdit = collection.permission === "owner";
  const canAddImages =
    collection.permission === "owner" ||
    collection.permission === "collaborator";

  // Count images and videos separately
  const imageCount = images.filter((a) => a.assetType === "image").length;
  const videoCount = images.filter((a) => a.assetType === "video").length;

  const getAssetCountText = () => {
    const parts = [];
    if (imageCount > 0) {
      parts.push(t("imageCount", { count: imageCount }));
    }
    if (videoCount > 0) {
      parts.push(t("videoCount", { count: videoCount }));
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
        <Button
          variant="light"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push("/collection")}
          className="mb-4"
        >
          {t("backToCollections")}
        </Button>

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
              {collection.isOwner && collection.projectId && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => router.push(`/projects/${collection.projectId}`)}
                >
                  {t("openProject")}
                </Button>
              )}
            </div>
            <p className="text-default-500">{getAssetCountText()}</p>
          </div>

          {canEdit && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="flat"
                startContent={<Pencil size={18} />}
                onPress={onRenameOpen}
                className="w-full sm:w-auto"
              >
                {tCommon("rename")}
              </Button>
              <Button
                variant="flat"
                startContent={<Share2 size={18} />}
                onPress={onShareOpen}
                className="w-full sm:w-auto"
              >
                {tCommon("share") || "Share"}
              </Button>
              <Button
                color="danger"
                variant="flat"
                startContent={<Trash2 size={18} />}
                onPress={onDeleteOpen}
                className="w-full sm:w-auto"
              >
                {tCommon("delete")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Assets Grid */}
      {images.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-default-500">{t("noAssetsInCollection")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((asset) => (
            <Card key={asset.id} className="group relative">
              <CardBody className="p-0 overflow-hidden aspect-square relative rounded-lg">
                <Image
                  src={asset.imageUrl} // Use CloudFront URL from API (signed cookies)
                  alt={asset.generationDetails.title}
                  radius="none"
                  classNames={{
                    wrapper: "w-full h-full !max-w-full cursor-pointer",
                    img: "w-full h-full object-cover",
                  }}
                  onClick={() => handleAssetClick(asset)}
                />
                {/* Video Badge */}
                {asset.assetType === "video" && (
                  <div className="absolute top-2 left-2 z-10">
                    <div className="bg-black/70 text-white rounded-full p-1.5 flex items-center gap-1">
                      <Play size={12} fill="white" />
                      <span className="text-[10px] font-medium pr-1">{t("video")}</span>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {asset.generationDetails.title}
                </div>
                {canAddImages && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="solid"
                          className="bg-background/80 backdrop-blur-sm"
                        >
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Asset actions">
                        <DropdownItem
                          key="view"
                          startContent={<Eye size={16} />}
                          onPress={() => handleAssetClick(asset)}
                        >
                          {t("viewDetails")}
                        </DropdownItem>
                        <DropdownItem
                          key="rename"
                          startContent={<Pencil size={16} />}
                          onPress={() => openRenameItemModal(asset)}
                        >
                          {tCommon("rename")}
                        </DropdownItem>
                        <DropdownItem
                          key="move"
                          startContent={<Move size={16} />}
                          onPress={() => openMoveItemModal(asset)}
                          isDisabled={availableCollections.length === 0}
                        >
                          {t("moveTo")}
                        </DropdownItem>
                        <DropdownItem
                          key="copy"
                          startContent={<Copy size={16} />}
                          onPress={() => openCopyItemModal(asset)}
                          isDisabled={availableCollections.length === 0}
                        >
                          {t("copyTo")}
                        </DropdownItem>
                        {asset.chatId && collection.isOwner ? (
                          <DropdownItem
                            key="chat"
                            startContent={<MessageSquare size={16} />}
                            onPress={() => router.push(`/chat/${asset.chatId}`)}
                          >
                            {t("goToChat")}
                          </DropdownItem>
                        ) : null}
                        <DropdownItem
                          key="remove"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 size={16} />}
                          onPress={() => confirmRemoveImage(asset)}
                        >
                          {t("removeFromCollection")}
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

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
      <Modal isOpen={isShareOpen} onOpenChange={onShareOpenChange} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("shareCollection")}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <Input
                        label={t("searchUser")}
                        placeholder={t("enterEmailAddress")}
                        value={searchEmail}
                        onValueChange={setSearchEmail}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSearchUser();
                        }}
                        errorMessage={searchError}
                        isInvalid={!!searchError}
                        className="flex-1"
                      />
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={handleSearchUser}
                        isLoading={isSearching}
                        className="mt-2 h-10"
                      >
                        {tCommon("search")}
                      </Button>
                    </div>

                    {searchedUser && (
                      <div className="flex flex-col gap-2 p-4 bg-default-50 rounded-lg border border-divider">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm">{t("userFound")}</p>
                            <p className="text-sm">{searchedUser.email}</p>
                          </div>
                          {collection.userId === searchedUser.id ? (
                            <Chip color="warning" variant="flat" size="sm">
                              {t("owner")}
                            </Chip>
                          ) : shares.some(
                            (s) => s.sharedWithUserId === searchedUser.id
                          ) ? (
                            <Chip color="primary" variant="flat" size="sm">
                              {t("alreadyShared")}
                            </Chip>
                          ) : (
                            <Chip color="success" variant="flat" size="sm">
                              {t("available")}
                            </Chip>
                          )}
                        </div>

                        {collection.userId !== searchedUser.id && (
                          <div className="flex gap-2 mt-2 items-end">
                            <Select
                              label={t("permission")}
                              selectedKeys={[selectedPermission]}
                              onChange={(e) =>
                                setSelectedPermission(
                                  e.target.value as "viewer" | "collaborator"
                                )
                              }
                              className="flex-1"
                              size="sm"
                            >
                              <SelectItem key="viewer">{t("viewer")}</SelectItem>
                              <SelectItem key="collaborator">
                                {t("collaborator")}
                              </SelectItem>
                            </Select>
                            <Button
                              color="primary"
                              onPress={handleShare}
                              isLoading={isSharing}
                              className="h-10"
                            >
                              {tCommon("share")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {shares.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold mb-3">
                        {t("currentlySharedWith")}
                      </h3>
                      <div className="space-y-2">
                        {shares.map((share) => {
                          // Since we don't have all users loaded, we might only show email if we have it
                          // For now, we rely on backend to provide email in shares or we need to fetch it.
                          // The current API structure returns shares with user ID.
                          // We should update the GET endpoint to return email for shares.
                          return (
                            <div
                              key={share.id}
                              className="flex items-center justify-between p-3 bg-default-100 rounded-lg"
                            >
                              <div>
                                <p className="font-medium">{share.email}</p>
                                <p className="text-xs text-default-500 capitalize">
                                  {share.permission}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="light"
                                color="danger"
                                startContent={<X size={16} />}
                                onPress={() =>
                                  handleRemoveShare(share.sharedWithUserId)
                                }
                              >
                                {tCommon("remove")}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
      <Modal
        isOpen={isVideoDetailOpen}
        onOpenChange={onVideoDetailOpenChange}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <Video size={20} />
                {t("videoDetails")}
              </ModalHeader>
              <ModalBody>
                {selectedVideo && (
                  <div className="space-y-4">
                    {/* Video Player */}
                    <div className="rounded-lg overflow-hidden bg-black">
                      {selectedVideo.videoUrl ? (
                        <video
                          src={selectedVideo.videoUrl}
                          controls
                          autoPlay
                          playsInline
                          className="w-full max-h-[60vh]"
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center">
                          <Image
                            src={selectedVideo.imageUrl}
                            alt={selectedVideo.generationDetails.title}
                            classNames={{
                              wrapper: "w-full h-full",
                              img: "w-full h-full object-contain",
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Title & Prompt */}
                    <div className="bg-default-100 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">
                        {selectedVideo.generationDetails.title || t("untitledVideo")}
                      </h4>
                      {selectedVideo.generationDetails.prompt && (
                        <p className="text-sm text-default-600 whitespace-pre-wrap">
                          {selectedVideo.generationDetails.prompt}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                {selectedVideo?.videoUrl && (
                  <Button
                    color="primary"
                    startContent={<Download size={16} />}
                    onPress={() => handleVideoDownload(selectedVideo)}
                  >
                    {tCommon("download")}
                  </Button>
                )}
                <Button variant="light" onPress={onClose}>
                  {tCommon("close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Rename Item Modal */}
      <Modal isOpen={isRenameItemOpen} onOpenChange={onRenameItemOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{itemToRename?.assetType === "video" ? t("renameVideo") : t("renameImage")}</ModalHeader>
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

      {/* Move Item Modal */}
      <Modal isOpen={isMoveItemOpen} onOpenChange={onMoveItemOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("moveToCollection")}</ModalHeader>
              <ModalBody>
                {availableCollections.length === 0 ? (
                  <p className="text-default-500">
                    {t("noOtherCollections")}
                  </p>
                ) : (
                  <Select
                    label={t("selectCollection")}
                    placeholder={t("chooseCollection")}
                    selectedKeys={selectedTargetCollection ? [selectedTargetCollection] : []}
                    onChange={(e) => setSelectedTargetCollection(e.target.value)}
                  >
                    {availableCollections.map((col) => (
                      <SelectItem key={col.id}>{col.name}</SelectItem>
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
                  onPress={handleMoveItem}
                  isLoading={isMovingItem}
                  isDisabled={!selectedTargetCollection}
                >
                  {t("move")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Copy Item Modal */}
      <Modal isOpen={isCopyItemOpen} onOpenChange={onCopyItemOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("copyToCollection")}</ModalHeader>
              <ModalBody>
                {availableCollections.length === 0 ? (
                  <p className="text-default-500">
                    {t("noOtherCollections")}
                  </p>
                ) : (
                  <Select
                    label={t("selectCollection")}
                    placeholder={t("chooseCollection")}
                    selectedKeys={selectedTargetCollection ? [selectedTargetCollection] : []}
                    onChange={(e) => setSelectedTargetCollection(e.target.value)}
                  >
                    {availableCollections.map((col) => (
                      <SelectItem key={col.id}>{col.name}</SelectItem>
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
                  onPress={handleCopyItem}
                  isLoading={isCopyingItem}
                  isDisabled={!selectedTargetCollection}
                >
                  {t("copy")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
