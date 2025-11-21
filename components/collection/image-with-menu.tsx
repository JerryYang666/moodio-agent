"use client";

import { useState, useRef } from "react";
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
import { MoreVertical, Eye, FolderPlus, Plus } from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import { motion, AnimatePresence } from "framer-motion";

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
}

const FlyingImage = ({
  imageUrl,
  startPosition,
  endPosition,
  onComplete,
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
        alt="Flying image"
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
  const {
    collections,
    createCollection,
    addImageToCollection,
    getDefaultCollectionName,
  } = useCollections();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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

  const getCollectionsButtonPosition = () => {
    const button = document.getElementById("collections-button");
    if (button) {
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - 20,
        y: rect.top + rect.height / 2 - 20,
      };
    }
    return { x: window.innerWidth / 2, y: 100 };
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

  const endPos = getCollectionsButtonPosition();

  return (
    <>
      <div ref={imageRef} className="relative group">
        {children}
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Dropdown
            isOpen={isMenuOpen}
            onOpenChange={setIsMenuOpen}
          >
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
              aria-label="Image actions"
              onAction={(key) => {
                if (key === "view") {
                  onViewDetails();
                } else if (key === "create-new") {
                  handleCreateNewCollection();
                }
              }}
            >
              <DropdownItem
                key="view"
                startContent={<Eye size={16} />}
              >
                View Details
              </DropdownItem>
              <DropdownSection title="Add to Collection" showDivider>
                <DropdownItem
                  key="create-new"
                  startContent={<Plus size={16} />}
                  className="font-semibold"
                >
                  Create New Collection
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title={collections.length > 0 ? "Your Collections" : undefined}>
                {collections.length === 0 ? (
                  <DropdownItem key="no-collections" isReadOnly>
                    <span className="text-xs text-default-400">
                      No collections yet
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
          />
        ))}
      </AnimatePresence>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Create New Collection</ModalHeader>
              <ModalBody>
                <Input
                  label="Collection Name"
                  placeholder="Enter collection name"
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
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateAndAdd}
                  isLoading={isCreating}
                  isDisabled={!newCollectionName.trim()}
                >
                  Create & Add
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

