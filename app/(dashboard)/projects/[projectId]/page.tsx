"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { ArrowLeft, Folder, Plus } from "lucide-react";
import ImageDetailModal, { ImageInfo } from "@/components/chat/image-detail-modal";

type Project = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Collection = {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type Asset = {
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
  addedAt: Date;
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [rootAssets, setRootAssets] = useState<Asset[]>([]);

  const {
    isOpen: isCreateCollectionOpen,
    onOpen: onCreateCollectionOpen,
    onOpenChange: onCreateCollectionOpenChange,
  } = useDisclosure();

  const {
    isOpen: isImageDetailOpen,
    onOpen: onImageDetailOpen,
    onOpenChange: onImageDetailOpenChange,
    onClose: onImageDetailClose,
  } = useDisclosure();

  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          router.push("/projects");
          return;
        }
        const data = await res.json();
        setProject(data.project);
        setCollections(data.collections || []);
        setRootAssets(data.rootAssets || []);
      } catch (e) {
        console.error("Failed to fetch project", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, router]);

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    setIsCreatingCollection(true);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCollectionName.trim(), projectId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const collection: any = data.collection;
      if (collection) {
        setCollections((prev) => [collection, ...prev]);
        setNewCollectionName("");
        onCreateCollectionOpenChange();
        router.push(`/collection/${collection.id}`);
      }
    } catch (e) {
      console.error("Error creating collection", e);
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleImageClick = (asset: Asset) => {
    const imagesForNav: ImageInfo[] = rootAssets.map((a) => ({
      url: a.imageUrl,
      title: a.generationDetails.title,
      prompt: a.generationDetails.prompt,
      status: a.generationDetails.status,
      imageId: a.imageId,
    }));
    const clickedIndex = imagesForNav.findIndex((img) => img.imageId === asset.imageId);
    setAllImages(imagesForNav);
    setCurrentImageIndex(clickedIndex >= 0 ? clickedIndex : 0);
    setSelectedImage({
      url: asset.imageUrl,
      title: asset.generationDetails.title,
      prompt: asset.generationDetails.prompt,
      status: asset.generationDetails.status,
      imageId: asset.imageId,
    });
    onImageDetailOpen();
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

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-default-500">Project not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <Button
          variant="light"
          startContent={<ArrowLeft size={20} />}
          onPress={() => router.push("/projects")}
          className="mb-4"
        >
          Back to Projects
        </Button>

        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 sm:gap-0">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              {project.isDefault && (
                <Chip size="sm" variant="flat" color="primary">
                  Default
                </Chip>
              )}
            </div>
            <p className="text-default-500">
              {collections.length} {collections.length === 1 ? "collection" : "collections"} •{" "}
              {rootAssets.length} {rootAssets.length === 1 ? "root asset" : "root assets"}
            </p>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              color="primary"
              startContent={<Plus size={18} />}
              onPress={() => {
                setNewCollectionName(`${project.name} Collection`);
                onCreateCollectionOpen();
              }}
              className="w-full sm:w-auto"
            >
              New Collection
            </Button>
          </div>
        </div>
      </div>

      {/* Root assets grid */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Project root assets</h2>
        {rootAssets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-default-500">No root assets yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {rootAssets.map((asset) => (
              <Card key={asset.id} className="group relative">
                <CardBody className="p-0 overflow-hidden aspect-square relative rounded-lg">
                  <Image
                    src={asset.imageUrl}
                    alt={asset.generationDetails.title}
                    radius="none"
                    classNames={{
                      wrapper: "w-full h-full !max-w-full cursor-pointer",
                      img: "w-full h-full object-cover",
                    }}
                    onClick={() => handleImageClick(asset)}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-black/60 text-black dark:text-white p-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {asset.generationDetails.title}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Collections grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Collections</h2>
        {collections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-default-500">No collections in this project yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {collections.map((collection) => (
              <Card
                key={collection.id}
                isPressable
                onPress={() => router.push(`/collection/${collection.id}`)}
              >
                <CardBody className="p-4">
                  <div className="flex items-center justify-center w-full h-28 bg-default-100 rounded-lg mb-0">
                    <Folder size={40} className="text-default-400" />
                  </div>
                </CardBody>
                <CardFooter className="flex flex-col items-start gap-1 px-4 pb-4">
                  <h3 className="font-semibold text-base truncate w-full">
                    {collection.name}
                  </h3>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateCollectionOpen} onOpenChange={onCreateCollectionOpenChange}>
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
                    if (e.key === "Enter") handleCreateCollection();
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
                  onPress={handleCreateCollection}
                  isLoading={isCreatingCollection}
                  isDisabled={!newCollectionName.trim()}
                >
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ImageDetailModal
        isOpen={isImageDetailOpen}
        onOpenChange={onImageDetailOpenChange}
        selectedImage={selectedImage}
        allImages={allImages}
        currentIndex={currentImageIndex}
        onNavigate={handleImageNavigate}
        onClose={onImageDetailClose}
      />
    </div>
  );
}


