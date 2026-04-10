"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { ChevronRight, ChevronDown, Folder, Library } from "lucide-react";
import { useCollections } from "@/hooks/use-collections";
import { hasWriteAccess } from "@/lib/permissions";
import { nextApi } from "@/lib/redux/services/next-api";
import { buildTree, type TreeNode } from "@/lib/tree-utils";

export type LocationTarget =
  | { type: "collection"; collectionId: string }
  | { type: "folder"; folderId: string };

interface LocationPickerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  confirmColor?: "primary" | "secondary" | "danger";
  isLoading?: boolean;
  excludeCollectionId?: string;
  excludeFolderId?: string;
  onConfirm: (target: LocationTarget) => void;
}

function FolderTreeNode({
  node,
  level,
  selectedId,
  excludeFolderId,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectedId: string | null;
  excludeFolderId?: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isExcluded = node.id === excludeFolderId;
  const isSelected = selectedId === `folder:${node.id}`;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
          isExcluded
            ? "opacity-60 cursor-pointer"
            : isSelected
              ? "bg-primary/15 text-primary font-medium"
              : "hover:bg-default-100 cursor-pointer"
        }`}
        style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}
        onClick={() => {
          if (!isExcluded) onSelect(`folder:${node.id}`);
          if (hasChildren) setExpanded((v) => !v);
        }}
      >
        {hasChildren ? (
          <span
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <Folder size={14} className="shrink-0 text-default-500" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <FolderTreeNode
            key={child.id}
            node={child}
            level={level + 1}
            selectedId={selectedId}
            excludeFolderId={excludeFolderId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function CollectionTreeRow({
  collection,
  selectedId,
  excludeCollectionId,
  excludeFolderId,
  onSelect,
}: {
  collection: { id: string; name: string };
  selectedId: string | null;
  excludeCollectionId?: string;
  excludeFolderId?: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isExcluded = collection.id === excludeCollectionId;
  const isSelected = selectedId === `collection:${collection.id}`;

  const { data: folderTree, isFetching } =
    nextApi.useGetFolderTreeQuery(collection.id, {
      skip: !expanded,
    });

  const treeNodes = useMemo(
    () => (folderTree ? buildTree(folderTree) : []),
    [folderTree]
  );

  const hasFolders = expanded && treeNodes.length > 0;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors ${
          isSelected
            ? "bg-primary/15 text-primary font-medium"
            : "hover:bg-default-100 cursor-pointer"
        }`}
        onClick={() => {
          if (!isExcluded) {
            onSelect(`collection:${collection.id}`);
          }
          setExpanded((v) => !v);
        }}
      >
        <span
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Library size={14} className="shrink-0 text-default-500" />
        <span className={`truncate ${isExcluded ? "text-default-400" : ""}`}>{collection.name}</span>
        {isExcluded && <span className="text-xs text-default-400 ml-auto shrink-0">(current)</span>}
      </button>
      {expanded && isFetching && (
        <div className="pl-10 py-1">
          <Spinner size="sm" />
        </div>
      )}
      {hasFolders &&
        treeNodes.map((node) => (
          <FolderTreeNode
            key={node.id}
            node={node}
            level={1}
            selectedId={selectedId}
            excludeFolderId={excludeFolderId}
            onSelect={onSelect}
          />
        ))}
      {expanded && !isFetching && treeNodes.length === 0 && (
        <div className="pl-10 py-1 text-xs text-default-400">
          No folders
        </div>
      )}
    </div>
  );
}

export default function LocationPicker({
  isOpen,
  onOpenChange,
  title,
  confirmLabel,
  confirmColor = "primary",
  isLoading,
  excludeCollectionId,
  excludeFolderId,
  onConfirm,
}: LocationPickerProps) {
  const { collections } = useCollections();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const writableCollections = useMemo(
    () => collections.filter((c) => hasWriteAccess(c.permission)),
    [collections]
  );

  const handleConfirm = useCallback(() => {
    if (!selectedId) return;
    const [type, id] = selectedId.split(":");
    if (type === "collection") {
      onConfirm({ type: "collection", collectionId: id });
    } else {
      onConfirm({ type: "folder", folderId: id });
    }
  }, [selectedId, onConfirm]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setSelectedId(null);
      onOpenChange(open);
    },
    [onOpenChange]
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} size="md" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody className="px-3">
              <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                {writableCollections.length === 0 ? (
                  <p className="text-default-500 text-sm py-4 text-center">
                    No collections available
                  </p>
                ) : (
                  writableCollections.map((col) => (
                    <CollectionTreeRow
                      key={col.id}
                      collection={col}
                      selectedId={selectedId}
                      excludeCollectionId={excludeCollectionId}
                      excludeFolderId={excludeFolderId}
                      onSelect={setSelectedId}
                    />
                  ))
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color={confirmColor}
                onPress={handleConfirm}
                isLoading={isLoading}
                isDisabled={!selectedId}
              >
                {confirmLabel}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
