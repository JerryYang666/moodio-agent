"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@heroui/spinner";
import { ChevronRight, ChevronDown, Folder, Images, FolderRoot } from "lucide-react";
import { nextApi } from "@/lib/redux/services/next-api";
import { buildTree, type TreeNode } from "@/lib/tree-utils";

function PickerFolderNode({
  node,
  level,
  selectedFolderId,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectedFolderId: string | null;
  onSelect: (folderId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolderId === node.id;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
          isSelected
            ? "bg-primary/15 text-primary font-medium"
            : "hover:bg-default-100 cursor-pointer"
        }`}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={() => {
          onSelect(node.id);
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
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Folder size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <PickerFolderNode
            key={child.id}
            node={child}
            level={level + 1}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export default function AssetPickerFolderTree({
  collectionId,
  selectedFolderId,
  isCollectionRoot,
  onSelectFolder,
}: {
  collectionId: string | null;
  selectedFolderId: string | null;
  isCollectionRoot: boolean;
  onSelectFolder: (folderId: string | null, isRoot: boolean) => void;
}) {
  const t = useTranslations();

  const { data: folderTree, isFetching } = nextApi.useGetFolderTreeQuery(
    collectionId!,
    { skip: !collectionId }
  );

  const treeNodes = useMemo(
    () => (folderTree ? buildTree(folderTree) : []),
    [folderTree]
  );

  if (!collectionId) return null;

  const isAllSelected = !selectedFolderId && !isCollectionRoot;
  const isRootSelected = !selectedFolderId && isCollectionRoot;

  return (
    <div className="w-[200px] shrink-0 border-r border-divider overflow-y-auto pr-1">
      <div className="text-[10px] font-medium text-default-400 uppercase tracking-wider px-2 pt-1 pb-1">
        {t("assetPicker.folders")}
      </div>

      <button
        type="button"
        className={`w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
          isAllSelected
            ? "bg-primary/15 text-primary font-medium"
            : "hover:bg-default-100 cursor-pointer"
        }`}
        onClick={() => onSelectFolder(null, false)}
      >
        <span className="w-3 shrink-0" />
        <Images size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{t("assetPicker.allAssets")}</span>
      </button>

      <button
        type="button"
        className={`w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
          isRootSelected
            ? "bg-primary/15 text-primary font-medium"
            : "hover:bg-default-100 cursor-pointer"
        }`}
        onClick={() => onSelectFolder(null, true)}
      >
        <span className="w-3 shrink-0" />
        <FolderRoot size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{t("assetPicker.rootOnly")}</span>
      </button>

      {isFetching ? (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      ) : treeNodes.length === 0 ? (
        <div className="px-2 py-1.5 text-[10px] text-default-400">
          {t("assetPicker.noFolders")}
        </div>
      ) : (
        treeNodes.map((node) => (
          <PickerFolderNode
            key={node.id}
            node={node}
            level={0}
            selectedFolderId={selectedFolderId}
            onSelect={(id) => onSelectFolder(id, false)}
          />
        ))
      )}
    </div>
  );
}
