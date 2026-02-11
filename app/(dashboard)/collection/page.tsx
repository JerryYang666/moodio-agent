"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Folder, Plus, MoreVertical, Pencil } from "lucide-react";
import { useCollections } from "@/hooks/use-collections";

export default function CollectionsPage() {
  const router = useRouter();
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const { collections, loading, createCollection, renameCollection, getDefaultCollectionName } =
    useCollections();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [collectionToRename, setCollectionToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;

    setIsCreating(true);
    try {
      const collection = await createCollection(newCollectionName.trim());
      if (collection) {
        setNewCollectionName("");
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
    onOpen();
  };

  const handleRenameCollection = async () => {
    if (!collectionToRename || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      const success = await renameCollection(collectionToRename.id, renameValue.trim());
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
          <p className="text-default-500 mt-1">
            {t("subtitle")}
          </p>
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

      {collections.length === 0 ? (
        <div className="text-center py-20">
          <Folder size={64} className="mx-auto mb-4 text-default-300" />
          <h2 className="text-xl font-semibold mb-2">{t("noCollectionsYet")}</h2>
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collections.map((collection) => (
            <Card
              key={collection.id}
              isPressable
              onPress={() => router.push(`/collection/${collection.id}`)}
              className="hover:scale-105 transition-transform group"
            >
              <CardBody className="p-3 pb-1 relative">
                <div className="w-full h-40 bg-default-100 rounded-lg overflow-hidden">
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
                </div>
                {(collection.isOwner || collection.permission === "collaborator") && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
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
                    if (e.key === "Enter") {
                      handleCreateCollection();
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
    </div>
  );
}
