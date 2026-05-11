"use client";

import { useState, useRef, useMemo } from "react";
import { hasWriteAccess } from "@/lib/permissions";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Input } from "@heroui/input";
import {
  MoreVertical,
  Eye,
  FolderPlus,
  FolderTree,
  Plus,
  Folder,
  Video,
  LayoutDashboard,
} from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";
import { useFeatureFlag } from "@/lib/feature-flags";
import DestinationPickerModal, {
  type DestinationPick,
} from "@/components/chat/destination-picker-modal";
import ImageEditModal, {
  type ChatImageEditMode,
} from "@/components/chat/image-edit-modal";
import {
  Paintbrush,
  Crop as CropIcon,
  Eraser,
  Scissors,
  Orbit,
} from "lucide-react";

interface ImageWithMenuProps {
  imageId: string;
  imageUrl: string;
  chatId?: string | null;
  /** Timestamp of the originating chat message (used for precise back-navigation) */
  messageTimestamp?: number;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  onViewDetails: () => void;
  children?: React.ReactNode;
  /** Extra top-right action buttons shown left of the 3-dot menu */
  topRightActions?: React.ReactNode;
  /** When set, skip desktop picker and send directly to this desktop */
  desktopId?: string;
}

interface FlyingImageProps {
  imageUrl: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  onComplete: () => void;
  altText: string;
}

const FlyingImage = ({
  imageUrl,
  startPosition,
  endPosition,
  onComplete,
  altText,
}: FlyingImageProps) => {
  return (
    <motion.div
      initial={{
        position: "fixed",
        left: startPosition.x,
        top: startPosition.y,
        width: 100,
        height: 100,
        opacity: 1,
        zIndex: 9999,
      }}
      animate={{
        left: endPosition.x,
        top: endPosition.y,
        width: 40,
        height: 40,
        opacity: 0,
      }}
      transition={{
        duration: 0.7,
        ease: "easeInOut",
      }}
      onAnimationComplete={onComplete}
      className="pointer-events-none rounded-lg overflow-hidden shadow-lg"
    >
      <img
        src={imageUrl}
        alt={altText}
        className="w-full h-full object-cover"
      />
    </motion.div>
  );
};

export default function ImageWithMenu({
  imageId,
  imageUrl,
  chatId,
  messageTimestamp,
  generationDetails,
  onViewDetails,
  children,
  topRightActions,
  desktopId,
}: ImageWithMenuProps) {
  const tMenu = useTranslations("imageMenu");
  const tCollections = useTranslations("collections");
  const tCommon = useTranslations("common");
  const tVideo = useTranslations("video");
  const tDest = useTranslations("destinationPicker");
  const router = useRouter();
  const showDesktop = useFeatureFlag<boolean>("user_desktop") ?? false;
  const {
    collections,
    createCollection,
    addImageToCollection,
    getDefaultCollectionName,
  } = useCollections();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSavingToProject, setIsSavingToProject] = useState(false);
  const [flyingImages, setFlyingImages] = useState<
    Array<{ id: string; startPos: { x: number; y: number } }>
  >([]);
  const imageRef = useRef<HTMLDivElement>(null);

  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();

  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const {
    isOpen: isDesktopOpen,
    onOpen: onDesktopOpen,
    onOpenChange: onDesktopOpenChange,
  } = useDisclosure();

  // Destination picker (tree) for "Add to Existing Collection".
  const {
    isOpen: isDestOpen,
    onOpen: onDestOpen,
    onOpenChange: onDestOpenChange,
  } = useDisclosure();

  // Destination picker for image-edit ops (Redraw/Crop/Erase/Cutout).
  const [pendingEditMode, setPendingEditMode] = useState<ChatImageEditMode | null>(
    null
  );
  const {
    isOpen: isEditDestOpen,
    onOpen: onEditDestOpen,
    onOpenChange: onEditDestOpenChange,
  } = useDisclosure();
  const [editDestination, setEditDestination] = useState<DestinationPick | null>(
    null
  );
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onOpenChange: onEditOpenChange,
  } = useDisclosure();

  // End position: right side of screen (aligned with assets sidebar)
  const getEndPosition = () => {
    if (typeof window === "undefined") return { x: 0, y: 100 };
    return { x: window.innerWidth - 60, y: 100 };
  };

  const startFlyingAnimation = () => {
    if (!imageRef.current) return;

    const imageRect = imageRef.current.getBoundingClientRect();
    const startPos = {
      x: imageRect.left + imageRect.width / 2 - 50,
      y: imageRect.top + imageRect.height / 2 - 50,
    };

    const flyingId = `flying-${Date.now()}`;
    setFlyingImages((prev) => [...prev, { id: flyingId, startPos }]);
  };

  const handleAddToCollection = async (collectionId: string) => {
    const details = messageTimestamp
      ? { ...generationDetails, messageTimestamp }
      : generationDetails;
    const success = await addImageToCollection(
      collectionId,
      imageId,
      chatId || null,
      details
    );

    if (success) {
      startFlyingAnimation();
    }
  };

  // Add to a collection/folder destination (used by the tree picker).
  // Uses the raw /api/collection endpoint directly so we can pass folderId —
  // the useCollections hook doesn't support folder targets.
  const addImageToDestination = async (pick: DestinationPick) => {
    const details = messageTimestamp
      ? { ...generationDetails, messageTimestamp }
      : generationDetails;
    try {
      const res = await fetch(`/api/collection/${pick.collectionId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          chatId: chatId || null,
          generationDetails: details,
          folderId: pick.folderId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add to destination");
      }
      startFlyingAnimation();
      addToast({
        title: tMenu("savedToast", { name: pick.collectionName }),
        color: "success",
      });
      return true;
    } catch (err: any) {
      addToast({
        title: tCollections("error"),
        description: err?.message ?? "Failed to save",
        color: "danger",
      });
      return false;
    }
  };

  const handleDestinationConfirm = (pick: DestinationPick) => {
    onDestOpenChange();
    addImageToDestination(pick);
  };

  const startEditFlow = (mode: ChatImageEditMode) => {
    setPendingEditMode(mode);
    setEditDestination(null);
    onEditDestOpen();
  };

  const handleEditDestinationConfirm = (pick: DestinationPick) => {
    setEditDestination(pick);
    onEditDestOpenChange();
    onEditOpen();
  };

  const handleSaveToProject = async () => {
    setIsSavingToProject(true);
    const details = messageTimestamp
      ? { ...generationDetails, messageTimestamp }
      : generationDetails;
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          chatId: chatId || null,
          generationDetails: details,
        }),
      });

      if (res.ok) {
        startFlyingAnimation();
      }
    } catch (e) {
      console.error("Failed to save to project", e);
    } finally {
      setIsSavingToProject(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newCollectionName.trim()) return;

    setIsCreating(true);
    const details = messageTimestamp
      ? { ...generationDetails, messageTimestamp }
      : generationDetails;
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addImageToCollection(
          collection.id,
          imageId,
          chatId || null,
          details
        );
        setNewCollectionName("");
        onCreateOpenChange();
        startFlyingAnimation();
      }
    } catch (error: any) {
      const msg = error?.status === 409 ? tCollections("duplicateName") : tCollections("createFailed");
      addToast({ title: tCollections("error"), description: msg, color: "danger" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNewCollection = () => {
    setNewCollectionName(getDefaultCollectionName());
    onCreateOpen();
  };

  const removeFlyingImage = (id: string) => {
    setFlyingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const endPos = getEndPosition();

  // Hybrid menu: show up to 8 most-recently-updated writable collections as
  // flat items; users can still open the tree picker for anything else.
  const recentCollections = useMemo(() => {
    return collections
      .filter((c) => hasWriteAccess(c.permission))
      .slice()
      .sort((a, b) => {
        const at = new Date(a.updatedAt as unknown as string | Date).getTime();
        const bt = new Date(b.updatedAt as unknown as string | Date).getTime();
        return bt - at;
      })
      .slice(0, 8);
  }, [collections]);

  return (
    <>
      <div ref={imageRef} className="relative group">
        {children}

        <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10 flex items-center gap-2">
          {topRightActions}
          <Dropdown isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
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
            <DropdownMenu
              aria-label={tMenu("actionsLabel")}
              onAction={(key) => {
                if (key === "view") {
                  onViewDetails();
                } else if (key === "generate-video") {
                  router.push(`/storyboard?imageId=${imageId}`);
                } else if (key === "save-project") {
                  handleSaveToProject();
                } else if (key === "create-new") {
                  handleCreateNewCollection();
                } else if (key === "send-to-desktop") {
                  onDesktopOpen();
                } else if (key === "add-to-existing") {
                  onDestOpen();
                } else if (key === "edit-redraw") {
                  startEditFlow("redraw");
                } else if (key === "edit-crop") {
                  startEditFlow("crop");
                } else if (key === "edit-erase") {
                  startEditFlow("erase");
                } else if (key === "edit-cutout") {
                  startEditFlow("cutout");
                } else if (key === "edit-angles") {
                  startEditFlow("angles");
                }
              }}
            >
              <DropdownItem key="view" startContent={<Eye size={16} />}>
                {tMenu("viewDetails")}
              </DropdownItem>
              <DropdownItem
                key="generate-video"
                startContent={<Video size={16} />}
                className="text-primary"
              >
                {tVideo("generateVideo")}
              </DropdownItem>
              <DropdownItem
                key="send-to-desktop"
                startContent={<LayoutDashboard size={16} />}
                className={showDesktop ? "" : "hidden"}
              >
                Send to Desktop
              </DropdownItem>
              <DropdownSection title={tMenu("editGroup")} showDivider>
                <DropdownItem
                  key="edit-redraw"
                  startContent={<Paintbrush size={16} />}
                >
                  {tMenu("editRedraw")}
                </DropdownItem>
                <DropdownItem
                  key="edit-crop"
                  startContent={<CropIcon size={16} />}
                >
                  {tMenu("editCrop")}
                </DropdownItem>
                <DropdownItem
                  key="edit-erase"
                  startContent={<Eraser size={16} />}
                >
                  {tMenu("editErase")}
                </DropdownItem>
                <DropdownItem
                  key="edit-cutout"
                  startContent={<Scissors size={16} />}
                >
                  {tMenu("editCutout")}
                </DropdownItem>
                <DropdownItem
                  key="edit-angles"
                  startContent={<Orbit size={16} />}
                >
                  {tMenu("editAngles")}
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title={tMenu("addToCollection")} showDivider>
                <DropdownItem
                  key="create-new"
                  startContent={<Plus size={16} />}
                  className="font-semibold"
                >
                  {tCollections("createNewCollection")}
                </DropdownItem>
                <DropdownItem
                  key="add-to-existing"
                  startContent={<FolderTree size={16} />}
                  className="font-semibold"
                >
                  {tMenu("addToExistingCollection")}
                </DropdownItem>
              </DropdownSection>
              <DropdownSection
                title={
                  recentCollections.length > 0
                    ? tMenu("recentCollections")
                    : undefined
                }
              >
                {recentCollections.length === 0 ? (
                  <DropdownItem key="no-collections" isReadOnly>
                    <span className="text-xs text-default-400">
                      {tCollections("noCollectionsYet")}
                    </span>
                  </DropdownItem>
                ) : (
                  recentCollections.map((collection) => (
                    <DropdownItem
                      key={collection.id}
                      startContent={<FolderPlus size={16} />}
                      onPress={() => handleAddToCollection(collection.id)}
                    >
                      {collection.name}
                    </DropdownItem>
                  ))
                )}
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {/* Flying Images */}
      <AnimatePresence>
        {flyingImages.map((flying) => (
          <FlyingImage
            key={flying.id}
            imageUrl={imageUrl}
            startPosition={flying.startPos}
            endPosition={endPos}
            onComplete={() => removeFlyingImage(flying.id)}
            altText={tMenu("flyingImageAlt")}
          />
        ))}
      </AnimatePresence>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{tCollections("createNewCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={tCollections("collectionName")}
                  placeholder={tCollections("enterCollectionName")}
                  value={newCollectionName}
                  onValueChange={setNewCollectionName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateAndAdd();
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
                  onPress={handleCreateAndAdd}
                  isLoading={isCreating}
                  isDisabled={!newCollectionName.trim()}
                >
                  {tMenu("createAndAdd")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Send to Desktop Modal */}
      <SendToDesktopModal
        isOpen={isDesktopOpen}
        onOpenChange={onDesktopOpenChange}
        desktopId={desktopId}
        assets={[
          {
            assetType: "image",
            metadata: {
              imageId,
              chatId: chatId || undefined,
              messageTimestamp,
              title: generationDetails.title,
              prompt: generationDetails.prompt,
              status: generationDetails.status,
            },
          },
        ]}
      />

      {/* Destination picker for "Add to Existing Collection" */}
      <DestinationPickerModal
        isOpen={isDestOpen}
        onOpenChange={onDestOpenChange}
        onConfirm={handleDestinationConfirm}
      />

      {/* Destination picker for image-edit ops (choose where result goes first) */}
      <DestinationPickerModal
        isOpen={isEditDestOpen}
        onOpenChange={onEditDestOpenChange}
        onConfirm={handleEditDestinationConfirm}
        title={tDest("editTitle")}
        subtitle={tDest("editSubtitle")}
        confirmLabel={tDest("editConfirm")}
      />

      {/* Image edit modal (runs the chosen operation) */}
      {pendingEditMode && editDestination && (
        <ImageEditModal
          isOpen={isEditOpen}
          onOpenChange={onEditOpenChange}
          mode={pendingEditMode}
          sourceImageId={imageId}
          sourceImageUrl={imageUrl}
          sourceTitle={generationDetails.title}
          destination={editDestination}
          chatId={chatId || null}
          onClose={() => {
            setPendingEditMode(null);
            setEditDestination(null);
          }}
        />
      )}
    </>
  );
}
