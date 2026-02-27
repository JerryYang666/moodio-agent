"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
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
  Plus,
  Folder,
  Video,
  LayoutDashboard,
} from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import SendToDesktopModal from "@/components/desktop/SendToDesktopModal";

interface ImageWithMenuProps {
  imageId: string;
  imageUrl: string;
  chatId?: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  onViewDetails: () => void;
  children?: React.ReactNode;
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
  generationDetails,
  onViewDetails,
  children,
}: ImageWithMenuProps) {
  const tMenu = useTranslations("imageMenu");
  const tCollections = useTranslations("collections");
  const tCommon = useTranslations("common");
  const tVideo = useTranslations("video");
  const router = useRouter();
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
    const success = await addImageToCollection(
      collectionId,
      imageId,
      chatId || null,
      generationDetails
    );

    if (success) {
      startFlyingAnimation();
    }
  };

  const handleSaveToProject = async () => {
    setIsSavingToProject(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          chatId: chatId || null,
          generationDetails,
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
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        await addImageToCollection(
          collection.id,
          imageId,
          chatId || null,
          generationDetails
        );
        setNewCollectionName("");
        onCreateOpenChange();
        startFlyingAnimation();
      }
    } catch (error) {
      console.error("Error creating collection:", error);
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

  return (
    <>
      <div ref={imageRef} className="relative group">
        {children}

        <div className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
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
              >
                Send to Desktop
              </DropdownItem>
              <DropdownSection title={tMenu("addToCollection")} showDivider>
                <DropdownItem
                  key="create-new"
                  startContent={<Plus size={16} />}
                  className="font-semibold"
                >
                  {tCollections("createNewCollection")}
                </DropdownItem>
              </DropdownSection>
              <DropdownSection
                title={
                  collections.length > 0 ? tMenu("yourCollections") : undefined
                }
              >
                {collections.length === 0 ? (
                  <DropdownItem key="no-collections" isReadOnly>
                    <span className="text-xs text-default-400">
                      {tCollections("noCollectionsYet")}
                    </span>
                  </DropdownItem>
                ) : (
                  collections
                    .filter(
                      (c) =>
                        c.permission === "owner" ||
                        c.permission === "collaborator"
                    )
                    .map((collection) => (
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
        assets={[
          {
            assetType: "image",
            metadata: {
              imageId,
              chatId: chatId || undefined,
              title: generationDetails.title,
              prompt: generationDetails.prompt,
              status: generationDetails.status,
            },
          },
        ]}
      />
    </>
  );
}
