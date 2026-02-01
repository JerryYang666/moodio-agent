"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Folder, Plus } from "lucide-react";
import { useCollections } from "@/hooks/use-collections";

export default function CollectionsPage() {
  const router = useRouter();
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const { collections, loading, createCollection, getDefaultCollectionName } =
    useCollections();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
              className="hover:scale-105 transition-transform"
            >
              <CardBody className="p-4">
                <div className="flex items-center justify-center w-full h-32 bg-default-100 rounded-lg mb-0">
                  <Folder size={48} className="text-default-400" />
                </div>
              </CardBody>
              <CardFooter className="flex flex-col items-start gap-1 px-4 pb-4">
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
    </div>
  );
}
