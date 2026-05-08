"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { useTranslations } from "next-intl";
import { hasWriteAccess } from "@/lib/permissions";
import { useGetCollectionsQuery } from "@/lib/redux/services/next-api";
import AssetPickerUnifiedTree, {
  type UnifiedSelection,
} from "./asset-picker-unified-tree";

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
};

export type DestinationPick = {
  collectionId: string;
  folderId: string | null;
  collectionName: string;
};

interface DestinationPickerModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  onConfirm: (pick: DestinationPick) => void;
  title?: string;
  confirmLabel?: string;
}

/**
 * Reusable "pick a collection / folder" modal backed by the same tree used
 * in the asset picker. Returns a resolved destination (collectionId +
 * optional folderId) via onConfirm.
 */
export default function DestinationPickerModal({
  isOpen,
  onOpenChange,
  onConfirm,
  title,
  confirmLabel,
}: DestinationPickerModalProps) {
  const t = useTranslations();
  const tCommon = useTranslations("common");

  const { data: collections = [] } = useGetCollectionsQuery();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<UnifiedSelection>({
    kind: "recent",
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelection({ kind: "recent" });
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setProjects([
          ...(data.projects || []),
          ...(data.sharedProjects || []),
        ]);
      } catch (e) {
        console.error("Failed to load projects for destination picker", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const writableCollections = useMemo(
    () => collections.filter((c) => hasWriteAccess(c.permission)),
    [collections]
  );

  const resolved = useMemo<DestinationPick | null>(() => {
    if (selection.kind === "collection") {
      const c = writableCollections.find((x) => x.id === selection.collectionId);
      if (!c) return null;
      return { collectionId: c.id, folderId: null, collectionName: c.name };
    }
    if (selection.kind === "folder") {
      const c = writableCollections.find((x) => x.id === selection.collectionId);
      if (!c) return null;
      // folderRoot / folderId === null both map to "collection root"
      return {
        collectionId: c.id,
        folderId: selection.folderId ?? null,
        collectionName: c.name,
      };
    }
    return null;
  }, [selection, writableCollections]);

  const handleConfirm = () => {
    if (!resolved) return;
    onConfirm(resolved);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      scrollBehavior="inside"
      classNames={{ wrapper: "z-[80]" }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              {title ?? t("destinationPicker.title")}
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Spinner size="sm" />
                </div>
              ) : (
                <div className="min-h-[320px] max-h-[50vh] overflow-y-auto">
                  <AssetPickerUnifiedTree
                    projects={projects}
                    collections={writableCollections}
                    selection={selection}
                    onSelect={setSelection}
                    hideRecent
                  />
                </div>
              )}
              {!loading && !resolved && (
                <p className="text-xs text-default-400 mt-2">
                  {t("destinationPicker.hint")}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button
                color="primary"
                onPress={handleConfirm}
                isDisabled={!resolved}
              >
                {confirmLabel ?? t("destinationPicker.confirm")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
