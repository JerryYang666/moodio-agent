"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { PERMISSION_COLLABORATOR, type Permission } from "@/lib/permissions";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { ArrowLeft, Plus, Share2, Tags } from "lucide-react";
import ImageDetailModal, { ImageInfo } from "@/components/chat/image-detail-modal";
import { useShareModal, type ShareEntry } from "@/hooks/use-share-modal";
import ShareModal from "@/components/share-modal";
import {
  useCreateCollectionMutation,
  useRenameCollectionMutation,
} from "@/lib/redux/services/next-api";
import CollectionCard from "@/components/collection/collection-card";
import TagInput, { type TagValue } from "@/components/collection/tag-input";
import { getTagColor } from "@/lib/tag-colors";

type Project = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  permission?: Permission;
  isOwner?: boolean;
};

type Collection = {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  coverImageUrl?: string | null;
  tags?: { id: string; label: string; color: string }[];
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
  const t = useTranslations("projects");
  const tCollections = useTranslations("collections");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [rootAssets, setRootAssets] = useState<Asset[]>([]);
  const [shares, setShares] = useState<ShareEntry[]>([]);

  const {
    isOpen: isCreateCollectionOpen,
    onOpen: onCreateCollectionOpen,
    onOpenChange: onCreateCollectionOpenChange,
  } = useDisclosure();

  const {
    isOpen: isRenameCollectionOpen,
    onOpen: onRenameCollectionOpen,
    onOpenChange: onRenameCollectionOpenChange,
  } = useDisclosure();

  const {
    isOpen: isImageDetailOpen,
    onOpen: onImageDetailOpen,
    onOpenChange: onImageDetailOpenChange,
    onClose: onImageDetailClose,
  } = useDisclosure();

  const {
    isOpen: isShareOpen,
    onOpen: onShareOpen,
    onOpenChange: onShareOpenChange,
  } = useDisclosure();

  const shareModal = useShareModal({
    shareApiPath: `/api/projects/${projectId}/share`,
    onShareChanged: async () => { await fetchProjectData(); },
  });

  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionToRename, setCollectionToRename] = useState<Collection | null>(null);
  const [renameCollectionValue, setRenameCollectionValue] = useState("");

  const [createCollectionMutation, { isLoading: isCreatingCollection }] =
    useCreateCollectionMutation();
  const [renameCollectionMutation, { isLoading: isRenamingCollection }] =
    useRenameCollectionMutation();

  const {
    isOpen: isEditTagsOpen,
    onOpen: onEditTagsOpen,
    onOpenChange: onEditTagsOpenChange,
  } = useDisclosure();

  const [collectionToEditTags, setCollectionToEditTags] = useState<Collection | null>(null);
  const [editTagsValue, setEditTagsValue] = useState<TagValue[]>([]);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);

  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [allImages, setAllImages] = useState<ImageInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const fetchProjectData = async () => {
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
      setShares(data.shares || []);
    } catch (e) {
      console.error("Failed to fetch project", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    try {
      const collection = await createCollectionMutation({
        name: newCollectionName.trim(),
        projectId,
      }).unwrap();
      if (collection) {
        setCollections((prev) => [collection as unknown as Collection, ...prev]);
        setNewCollectionName("");
        onCreateCollectionOpenChange();
        router.push(`/collection/${collection.id}`);
      }
    } catch (e) {
      console.error("Error creating collection", e);
    }
  };

  const handleRenameCollection = async () => {
    if (!collectionToRename || !renameCollectionValue.trim()) return;
    try {
      const updated = await renameCollectionMutation({
        collectionId: collectionToRename.id,
        name: renameCollectionValue.trim(),
      }).unwrap();
      if (updated) {
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionToRename.id ? { ...c, name: updated.name } : c
          )
        );
        onRenameCollectionOpenChange();
        setCollectionToRename(null);
        setRenameCollectionValue("");
      }
    } catch (e) {
      console.error("Error renaming collection", e);
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

  // Unique tags for filter bar
  const allUniqueTags = useMemo(() => {
    const tagMap = new Map<string, { label: string; color: string }>();
    for (const col of collections) {
      for (const tag of col.tags ?? []) {
        if (!tagMap.has(tag.label)) {
          tagMap.set(tag.label, { label: tag.label, color: tag.color });
        }
      }
    }
    return Array.from(tagMap.values());
  }, [collections]);

  const filteredCollections = useMemo(() => {
    if (selectedFilterTags.length === 0) return collections;
    return collections.filter((col) => {
      const colTagLabels = new Set((col.tags ?? []).map((t) => t.label));
      return selectedFilterTags.every((ft) => colTagLabels.has(ft));
    });
  }, [collections, selectedFilterTags]);

  const toggleFilterTag = (label: string) => {
    setSelectedFilterTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  };

  const handleSaveEditTags = async () => {
    if (!collectionToEditTags) return;
    setIsSavingTags(true);
    try {
      await renameCollectionMutation({
        collectionId: collectionToEditTags.id,
        tags: editTagsValue,
      }).unwrap();
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionToEditTags.id
            ? { ...c, tags: editTagsValue.map((t, i) => ({ id: `temp-${i}`, ...t })) }
            : c
        )
      );
      onEditTagsOpenChange();
      setCollectionToEditTags(null);
      setEditTagsValue([]);
    } catch (error) {
      console.error("Error updating tags:", error);
    } finally {
      setIsSavingTags(false);
    }
  };

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
        <p className="text-default-500">{t("projectNotFound")}</p>
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
          {t("backToProjects")}
        </Button>

        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 sm:gap-0">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              {project.isDefault && (
                <Chip size="sm" variant="flat" color="primary">
                  {t("default")}
                </Chip>
              )}
              {project.permission && !project.isOwner && (
                <Chip size="sm" variant="flat" color="secondary">
                  {t(project.permission)}
                </Chip>
              )}
            </div>
            <p className="text-default-500">
              {t("collectionsCount", { count: collections.length })} •{" "}
              {t("rootAssetsCount", { count: rootAssets.length })}
            </p>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            {project.isOwner !== false && (
              <Button
                startContent={<Share2 size={18} />}
                onPress={onShareOpen}
                color="primary"
                variant="flat"
                className="w-full sm:w-auto"
              >
                {tCommon("share")}
              </Button>
            )}
            {(project.isOwner !== false || project.permission === PERMISSION_COLLABORATOR) && (
              <Button
                color="primary"
                startContent={<Plus size={18} />}
                onPress={() => {
                  setNewCollectionName(`${project.name} Collection`);
                  onCreateCollectionOpen();
                }}
                className="w-full sm:w-auto"
              >
                {t("newCollection")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Root assets grid */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3">{t("projectRootAssets")}</h2>
        {rootAssets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-default-500">{t("noRootAssetsYet")}</p>
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
        <h2 className="text-lg font-semibold mb-3">{tCollections("title")}</h2>

        {/* Tag filter bar */}
        {allUniqueTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-default-500 mr-1">{tCollections("filterByTag")}:</span>
            {allUniqueTags.map((tag) => {
              const isSelected = selectedFilterTags.includes(tag.label);
              const color = getTagColor(tag.color);
              return (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => toggleFilterTag(tag.label)}
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                    isSelected
                      ? `${color.bg} ${color.text} ring-2 ring-primary ring-offset-1`
                      : `${color.bg} ${color.text} opacity-60 hover:opacity-100`
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
            {selectedFilterTags.length > 0 && (
              <Button
                size="sm"
                variant="light"
                onPress={() => setSelectedFilterTags([])}
                className="text-xs h-6"
              >
                {tCollections("clearFilter")}
              </Button>
            )}
          </div>
        )}

        {filteredCollections.length === 0 && collections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-default-500">{t("noCollectionsInProject")}</p>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center py-12">
            <Tags size={36} className="mx-auto mb-3 text-default-300" />
            <p className="text-default-500">{tCollections("noCollectionsMatchFilter")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                onPress={() => router.push(`/collection/${collection.id}`)}
                thumbnailHeight="h-36"
                onRename={() => {
                  setCollectionToRename(collection);
                  setRenameCollectionValue(collection.name);
                  onRenameCollectionOpen();
                }}
                onEditTags={() => {
                  setCollectionToEditTags(collection);
                  setEditTagsValue(
                    (collection.tags ?? []).map((t) => ({
                      label: t.label,
                      color: t.color,
                    }))
                  );
                  onEditTagsOpen();
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      <Modal isOpen={isCreateCollectionOpen} onOpenChange={onCreateCollectionOpenChange}>
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
                    if (e.key === "Enter") handleCreateCollection();
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
                  onPress={handleCreateCollection}
                  isLoading={isCreatingCollection}
                  isDisabled={!newCollectionName.trim()}
                >
                  {tCommon("create")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Rename Collection Modal */}
      <Modal isOpen={isRenameCollectionOpen} onOpenChange={onRenameCollectionOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{tCollections("renameCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={tCollections("collectionName")}
                  placeholder={tCollections("enterCollectionName")}
                  value={renameCollectionValue}
                  onValueChange={setRenameCollectionValue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameCollection();
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
                  onPress={handleRenameCollection}
                  isLoading={isRenamingCollection}
                  isDisabled={!renameCollectionValue.trim()}
                >
                  {tCommon("rename")}
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
        title={t("shareProject")}
        ownerId={project?.userId ?? ""}
        shares={shares}
        share={shareModal}
      />

      {/* Edit Tags Modal */}
      <Modal isOpen={isEditTagsOpen} onOpenChange={onEditTagsOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {tCollections("editTags")} - {collectionToEditTags?.name}
              </ModalHeader>
              <ModalBody>
                <TagInput tags={editTagsValue} onChange={setEditTagsValue} />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSaveEditTags}
                  isLoading={isSavingTags}
                >
                  {tCommon("save")}
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


