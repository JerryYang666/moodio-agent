"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { PERMISSION_COLLABORATOR } from "@/lib/permissions";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Folder, Plus, MoreVertical, Pencil, Tags } from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import TagInput, { type TagValue } from "@/components/collection/tag-input";
import CollectionTags from "@/components/collection/collection-tags";
import { getTagColor } from "@/lib/tag-colors";

export default function CollectionsPage() {
  const router = useRouter();
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const {
    collections,
    loading,
    createCollection,
    renameCollection,
    updateCollectionTags,
    getDefaultCollectionName,
  } = useCollections();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();
  const {
    isOpen: isEditTagsOpen,
    onOpen: onEditTagsOpen,
    onOpenChange: onEditTagsOpenChange,
  } = useDisclosure();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionTags, setNewCollectionTags] = useState<TagValue[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [collectionToRename, setCollectionToRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [collectionToEditTags, setCollectionToEditTags] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editTagsValue, setEditTagsValue] = useState<TagValue[]>([]);
  const [isSavingTags, setIsSavingTags] = useState(false);

  // Tag filter state
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);

  // Compute all unique tag labels across collections for the filter bar
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

  // Filtered collections
  const filteredCollections = useMemo(() => {
    if (selectedFilterTags.length === 0) return collections;
    return collections.filter((col) => {
      const colTagLabels = new Set((col.tags ?? []).map((t) => t.label));
      return selectedFilterTags.every((ft) => colTagLabels.has(ft));
    });
  }, [collections, selectedFilterTags]);

  const toggleFilterTag = (label: string) => {
    setSelectedFilterTags((prev) =>
      prev.includes(label)
        ? prev.filter((t) => t !== label)
        : [...prev, label]
    );
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;

    setIsCreating(true);
    try {
      const collection = await createCollection(
        newCollectionName.trim(),
        undefined,
        newCollectionTags.length > 0 ? newCollectionTags : undefined
      );
      if (collection) {
        setNewCollectionName("");
        setNewCollectionTags([]);
        onOpenChange();
        router.push(`/collection/${collection.id}`);
      }
    } catch (error) {
      console.error("Error creating collection:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenCreateModal = () => {
    setNewCollectionName(getDefaultCollectionName());
    setNewCollectionTags([]);
    onOpen();
  };

  const handleRenameCollection = async () => {
    if (!collectionToRename || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      const success = await renameCollection(
        collectionToRename.id,
        renameValue.trim()
      );
      if (success) {
        onRenameOpenChange();
        setCollectionToRename(null);
        setRenameValue("");
      }
    } catch (error) {
      console.error("Error renaming collection:", error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleSaveEditTags = async () => {
    if (!collectionToEditTags) return;
    setIsSavingTags(true);
    try {
      const success = await updateCollectionTags(
        collectionToEditTags.id,
        editTagsValue
      );
      if (success) {
        onEditTagsOpenChange();
        setCollectionToEditTags(null);
        setEditTagsValue([]);
      }
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 sm:gap-0 mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-default-500 mt-1">{t("subtitle")}</p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={20} />}
          onPress={handleOpenCreateModal}
          className="w-full sm:w-auto"
        >
          {t("newCollection")}
        </Button>
      </div>

      {/* Tag filter bar */}
      {allUniqueTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-sm text-default-500 mr-1">{t("filterByTag")}:</span>
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
              {t("clearFilter")}
            </Button>
          )}
        </div>
      )}

      {filteredCollections.length === 0 && collections.length === 0 ? (
        <div className="text-center py-20">
          <Folder size={64} className="mx-auto mb-4 text-default-300" />
          <h2 className="text-xl font-semibold mb-2">
            {t("noCollectionsYet")}
          </h2>
          <p className="text-default-500 mb-6">
            {t("createFirstCollection")}
          </p>
          <Button
            color="primary"
            startContent={<Plus size={20} />}
            onPress={handleOpenCreateModal}
          >
            {t("createCollection")}
          </Button>
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className="text-center py-20">
          <Tags size={48} className="mx-auto mb-4 text-default-300" />
          <p className="text-default-500">{t("noCollectionsMatchFilter")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCollections.map((collection) => (
            <Card
              key={collection.id}
              isPressable
              onPress={() => router.push(`/collection/${collection.id}`)}
              className="hover:scale-105 transition-transform group"
            >
              <CardBody className="p-3 pb-1 relative">
                <div className="w-full h-40 bg-default-100 rounded-lg overflow-hidden relative">
                  {collection.coverImageUrl ? (
                    <Image
                      src={collection.coverImageUrl}
                      alt={collection.name}
                      radius="none"
                      classNames={{
                        wrapper: "w-full h-full !max-w-full",
                        img: "w-full h-full object-cover",
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <Folder size={48} className="text-default-400" />
                    </div>
                  )}
                  {/* Tags overlay on cover */}
                  {(collection.tags ?? []).length > 0 && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <CollectionTags tags={collection.tags ?? []} maxVisible={3} />
                    </div>
                  )}
                </div>
                {(collection.isOwner ||
                  collection.permission === PERMISSION_COLLABORATOR) && (
                  <div
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Dropdown>
                      <DropdownTrigger>
                        <div
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-medium bg-background/80 backdrop-blur-sm cursor-pointer hover:opacity-80"
                        >
                          <MoreVertical size={16} />
                        </div>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Collection actions">
                        <DropdownItem
                          key="rename"
                          startContent={<Pencil size={16} />}
                          onPress={() => {
                            setCollectionToRename(collection);
                            setRenameValue(collection.name);
                            onRenameOpen();
                          }}
                        >
                          {tCommon("rename")}
                        </DropdownItem>
                        <DropdownItem
                          key="editTags"
                          startContent={<Tags size={16} />}
                          onPress={() => {
                            setCollectionToEditTags(collection);
                            setEditTagsValue(
                              (collection.tags ?? []).map((t) => ({
                                label: t.label,
                                color: t.color,
                              }))
                            );
                            onEditTagsOpen();
                          }}
                        >
                          {t("editTags")}
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                )}
              </CardBody>
              <CardFooter className="flex flex-col items-start gap-1 px-3 pt-1 pb-3">
                <h3 className="font-semibold text-base truncate w-full">
                  {collection.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Chip
                    size="sm"
                    variant="flat"
                    color={collection.isOwner ? "primary" : "default"}
                    className="capitalize"
                  >
                    {collection.permission}
                  </Chip>
                  {!collection.isOwner && (
                    <Chip size="sm" variant="flat" color="secondary">
                      {t("shared")}
                    </Chip>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Collection Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("createNewCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("collectionName")}
                  placeholder={t("enterCollectionName")}
                  value={newCollectionName}
                  onValueChange={setNewCollectionName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !newCollectionTags.length) {
                      handleCreateCollection();
                    }
                  }}
                  autoFocus
                />
                <TagInput
                  tags={newCollectionTags}
                  onChange={setNewCollectionTags}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateCollection}
                  isLoading={isCreating}
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
      <Modal isOpen={isRenameOpen} onOpenChange={onRenameOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("renameCollection")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("collectionName")}
                  placeholder={t("enterCollectionName")}
                  value={renameValue}
                  onValueChange={setRenameValue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleRenameCollection();
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
                  onPress={handleRenameCollection}
                  isLoading={isRenaming}
                  isDisabled={!renameValue.trim()}
                >
                  {tCommon("rename")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Edit Tags Modal */}
      <Modal isOpen={isEditTagsOpen} onOpenChange={onEditTagsOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {t("editTags")} - {collectionToEditTags?.name}
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
    </div>
  );
}
