"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  Pencil,
  Trash2,
  Share2,
  ArrowLeft,
  X,
  MoreVertical,
  Eye,
  MessageSquare,
} from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import ImageDetailModal from "@/components/chat/image-detail-modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";

const AWS_S3_PUBLIC_URL = process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL || "";

const getImageUrl = (imageId: string) => {
  return `${AWS_S3_PUBLIC_URL}/${imageId}`;
};

interface CollectionData {
  collection: {
    id: string;
    userId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    permission: "owner" | "collaborator" | "viewer";
    isOwner: boolean;
  };
  images: Array<{
    id: string;
    collectionId: string;
    imageId: string;
    chatId: string | null;
    generationDetails: {
      title: string;
      prompt: string;
      status: "loading" | "generated" | "error";
      imageUrl?: string;
    };
    addedAt: Date;
  }>;
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
  const { renameCollection, deleteCollection, removeImageFromCollection } =
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

  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    title: string;
    prompt: string;
    status?: "loading" | "generated" | "error";
  } | null>(null);
  const [imageToRemoveId, setImageToRemoveId] = useState<string | null>(null);

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
      const res = await fetch(`/api/users/search?email=${encodeURIComponent(searchEmail.trim())}`);
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
    if (!imageToRemoveId) return;
    try {
      const success = await removeImageFromCollection(
        collectionId,
        imageToRemoveId
      );
      if (success) {
        setCollectionData((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.filter((img) => img.imageId !== imageToRemoveId),
              }
            : null
        );
        onRemoveImageOpenChange();
        setImageToRemoveId(null);
      }
    } catch (error) {
      console.error("Error removing image:", error);
    }
  };

  const confirmRemoveImage = (imageId: string) => {
    setImageToRemoveId(imageId);
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

  const handleImageClick = (image: CollectionData["images"][0]) => {
    setSelectedImage({
      url: image.generationDetails.imageUrl || getImageUrl(image.imageId),
      title: image.generationDetails.title,
      prompt: image.generationDetails.prompt,
      status: image.generationDetails.status,
    });
    onImageDetailOpen();
  };

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
        <p className="text-default-500">Collection not found</p>
      </div>
    );
  }

  const { collection, images, shares } = collectionData;
  const canEdit = collection.permission === "owner";
  const canAddImages =
    collection.permission === "owner" ||
    collection.permission === "collaborator";

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
          Back to Collections
        </Button>

        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{collection.name}</h1>
              <Chip
                size="sm"
                variant="flat"
                color={collection.isOwner ? "primary" : "default"}
              >
                {collection.permission}
              </Chip>
            </div>
            <p className="text-default-500">
              {images.length} {images.length === 1 ? "image" : "images"}
            </p>
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <Button
                variant="flat"
                startContent={<Pencil size={18} />}
                onPress={onRenameOpen}
              >
                Rename
              </Button>
              <Button
                variant="flat"
                startContent={<Share2 size={18} />}
                onPress={onShareOpen}
              >
                Share
              </Button>
              <Button
                color="danger"
                variant="flat"
                startContent={<Trash2 size={18} />}
                onPress={onDeleteOpen}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Images Grid */}
      {images.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-default-500">
            No images in this collection yet
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((image) => (
            <Card key={image.id} className="group relative">
              <CardBody className="p-0 overflow-hidden aspect-square relative rounded-lg">
                <img
                  src={
                    image.generationDetails.imageUrl ||
                    getImageUrl(image.imageId)
                  }
                  alt={image.generationDetails.title}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => handleImageClick(image)}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {image.generationDetails.title}
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
                      <DropdownMenu aria-label="Image actions">
                        <DropdownItem
                          key="view"
                          startContent={<Eye size={16} />}
                          onPress={() => handleImageClick(image)}
                        >
                          View Details
                        </DropdownItem>
                        {image.chatId && collection.isOwner ? (
                          <DropdownItem
                            key="chat"
                            startContent={<MessageSquare size={16} />}
                            onPress={() => router.push(`/chat/${image.chatId}`)}
                          >
                            Go to Chat
                          </DropdownItem>
                        ) : null}
                        <DropdownItem
                          key="remove"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 size={16} />}
                          onPress={() => confirmRemoveImage(image.imageId)}
                        >
                          Remove from Collection
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
              <ModalHeader>Rename Collection</ModalHeader>
              <ModalBody>
                <Input
                  label="Collection Name"
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
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleRename}
                  isLoading={isRenaming}
                  isDisabled={!newName.trim()}
                >
                  Rename
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
              <ModalHeader>Delete Collection</ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete this collection? This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDelete}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Share Modal */}
      <Modal
        isOpen={isShareOpen}
        onOpenChange={onShareOpenChange}
        size="2xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Share Collection</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <Input
                        label="Search User"
                        placeholder="Enter email address"
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
                        Search
                      </Button>
                    </div>

                    {searchedUser && (
                      <div className="flex flex-col gap-2 p-4 bg-default-50 rounded-lg border border-divider">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm">User Found</p>
                            <p className="text-sm">{searchedUser.email}</p>
                          </div>
                          {collection.userId === searchedUser.id ? (
                            <Chip color="warning" variant="flat" size="sm">
                              Owner
                            </Chip>
                          ) : shares.some(
                              (s) => s.sharedWithUserId === searchedUser.id
                            ) ? (
                            <Chip color="primary" variant="flat" size="sm">
                              Already Shared
                            </Chip>
                          ) : (
                            <Chip color="success" variant="flat" size="sm">
                              Available
                            </Chip>
                          )}
                        </div>

                        {collection.userId !== searchedUser.id && (
                          <div className="flex gap-2 mt-2 items-end">
                            <Select
                              label="Permission"
                              selectedKeys={[selectedPermission]}
                              onChange={(e) =>
                                setSelectedPermission(
                                  e.target.value as "viewer" | "collaborator"
                                )
                              }
                              className="flex-1"
                              size="sm"
                            >
                              <SelectItem key="viewer">Viewer</SelectItem>
                              <SelectItem key="collaborator">
                                Collaborator
                              </SelectItem>
                            </Select>
                            <Button
                              color="primary"
                              onPress={handleShare}
                              isLoading={isSharing}
                              className="h-10"
                            >
                              Share
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {shares.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold mb-3">
                        Currently Shared With
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
                                <p className="font-medium">
                                  {share.email}
                                </p>
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
                                Remove
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
                  Close
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
              <ModalHeader>Remove Image</ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to remove this image from the collection?
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleRemoveImage}>
                  Remove
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
        onClose={onImageDetailClose}
      />
    </div>
  );
}

