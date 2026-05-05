"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@heroui/spinner";
import {
  ChevronRight,
  ChevronDown,
  Clock,
  Folder,
  FolderKanban,
  FolderRoot,
  Images,
} from "lucide-react";
import { nextApi, type CollectionItem } from "@/lib/redux/services/next-api";
import { buildTree, type TreeNode } from "@/lib/tree-utils";

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
};

export type UnifiedSelection =
  | { kind: "recent" }
  | { kind: "project"; projectId: string }
  | { kind: "collection"; projectId: string; collectionId: string }
  | {
      kind: "folder";
      projectId: string;
      collectionId: string;
      folderId: string | null;
      folderRoot: boolean;
    };

const rowBase =
  "w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors";
const rowInactive = "hover:bg-default-100 cursor-pointer";
const rowActive = "bg-primary/15 text-primary font-medium";

function Chevron({ expanded }: { expanded: boolean }) {
  return expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />;
}

function FolderNode({
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
        className={`${rowBase} ${isSelected ? rowActive : rowInactive}`}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
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
            <Chevron expanded={expanded} />
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Folder size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <FolderNode
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

function CollectionNode({
  collection,
  level,
  expanded,
  onToggle,
  selection,
  onSelect,
}: {
  collection: CollectionItem;
  level: number;
  expanded: boolean;
  onToggle: () => void;
  selection: UnifiedSelection;
  onSelect: (s: UnifiedSelection) => void;
}) {
  const t = useTranslations();
  const { data: folderTree, isFetching } = nextApi.useGetFolderTreeQuery(
    collection.id,
    { skip: !expanded }
  );

  const treeNodes = useMemo(
    () => (folderTree ? buildTree(folderTree) : []),
    [folderTree]
  );

  const isCollectionSelected =
    (selection.kind === "collection" && selection.collectionId === collection.id) ||
    (selection.kind === "folder" &&
      selection.collectionId === collection.id &&
      !selection.folderId &&
      !selection.folderRoot);

  const isRootSelected =
    selection.kind === "folder" &&
    selection.collectionId === collection.id &&
    selection.folderRoot;

  const selectedFolderId =
    selection.kind === "folder" && selection.collectionId === collection.id
      ? selection.folderId
      : null;

  const label = collection.isOwner
    ? collection.name
    : `${collection.name} (${t("assetPicker.sharedSuffix")})`;

  return (
    <div>
      <button
        type="button"
        className={`${rowBase} ${isCollectionSelected ? rowActive : rowInactive}`}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={() => {
          onSelect({
            kind: "collection",
            projectId: collection.projectId,
            collectionId: collection.id,
          });
          onToggle();
        }}
      >
        <span
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <Chevron expanded={expanded} />
        </span>
        <Images size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{label}</span>
      </button>

      {expanded && (
        <>
          <button
            type="button"
            className={`${rowBase} ${isRootSelected ? rowActive : rowInactive}`}
            style={{ paddingLeft: `${(level + 1) * 14 + 6}px` }}
            onClick={() =>
              onSelect({
                kind: "folder",
                projectId: collection.projectId,
                collectionId: collection.id,
                folderId: null,
                folderRoot: true,
              })
            }
          >
            <span className="w-3 shrink-0" />
            <FolderRoot size={12} className="shrink-0 text-default-500" />
            <span className="truncate">{t("assetPicker.rootOnly")}</span>
          </button>

          {isFetching ? (
            <div className="flex justify-center py-1.5">
              <Spinner size="sm" />
            </div>
          ) : treeNodes.length === 0 ? (
            <div
              className="py-1 text-[10px] text-default-400"
              style={{ paddingLeft: `${(level + 1) * 14 + 18}px` }}
            >
              {t("assetPicker.noFolders")}
            </div>
          ) : (
            treeNodes.map((node) => (
              <FolderNode
                key={node.id}
                node={node}
                level={level + 1}
                selectedFolderId={selectedFolderId}
                onSelect={(folderId) =>
                  onSelect({
                    kind: "folder",
                    projectId: collection.projectId,
                    collectionId: collection.id,
                    folderId,
                    folderRoot: false,
                  })
                }
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function ProjectNode({
  project,
  collections,
  level,
  expanded,
  onToggle,
  expandedCollections,
  toggleCollection,
  selection,
  onSelect,
}: {
  project: Project;
  collections: CollectionItem[];
  level: number;
  expanded: boolean;
  onToggle: () => void;
  expandedCollections: Set<string>;
  toggleCollection: (id: string) => void;
  selection: UnifiedSelection;
  onSelect: (s: UnifiedSelection) => void;
}) {
  const t = useTranslations();
  const projectCollections = useMemo(
    () => collections.filter((c) => c.projectId === project.id),
    [collections, project.id]
  );

  const isProjectSelected =
    selection.kind === "project" && selection.projectId === project.id;

  const label = project.isDefault
    ? `${project.name} (${t("assetPicker.defaultSuffix")})`
    : !project.isOwner
      ? `${project.name} (${t("assetPicker.sharedSuffix")})`
      : project.name;

  return (
    <div>
      <button
        type="button"
        className={`${rowBase} ${isProjectSelected ? rowActive : rowInactive}`}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={() => {
          onSelect({ kind: "project", projectId: project.id });
          onToggle();
        }}
      >
        <span
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <Chevron expanded={expanded} />
        </span>
        <FolderKanban size={12} className="shrink-0 text-default-500" />
        <span className="truncate">{label}</span>
      </button>

      {expanded && (
        projectCollections.length === 0 ? (
          <div
            className="py-1 text-[10px] text-default-400"
            style={{ paddingLeft: `${(level + 1) * 14 + 18}px` }}
          >
            {t("assetPicker.noCollections")}
          </div>
        ) : (
          projectCollections.map((c) => (
            <CollectionNode
              key={c.id}
              collection={c}
              level={level + 1}
              expanded={expandedCollections.has(c.id)}
              onToggle={() => toggleCollection(c.id)}
              selection={selection}
              onSelect={onSelect}
            />
          ))
        )
      )}
    </div>
  );
}

export default function AssetPickerUnifiedTree({
  projects,
  collections,
  selection,
  onSelect,
  className,
  hideRecent = false,
}: {
  projects: Project[];
  collections: CollectionItem[];
  selection: UnifiedSelection;
  onSelect: (s: UnifiedSelection) => void;
  className?: string;
  hideRecent?: boolean;
}) {
  const t = useTranslations();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    () => new Set()
  );

  // Auto-expand ancestors of the current selection so the modal re-opens on
  // the right node. Only ever *adds* — never collapses what the user opened.
  const selectedProjectId =
    selection.kind === "project" || selection.kind === "collection" || selection.kind === "folder"
      ? selection.projectId
      : null;
  const selectedCollectionId =
    selection.kind === "collection" || selection.kind === "folder"
      ? selection.collectionId
      : null;

  useEffect(() => {
    if (selectedProjectId) {
      setExpandedProjects((prev) =>
        prev.has(selectedProjectId) ? prev : new Set(prev).add(selectedProjectId)
      );
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedCollectionId) {
      setExpandedCollections((prev) =>
        prev.has(selectedCollectionId)
          ? prev
          : new Set(prev).add(selectedCollectionId)
      );
    }
  }, [selectedCollectionId]);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { owned, shared } = useMemo(() => {
    const owned: Project[] = [];
    const shared: Project[] = [];
    for (const p of projects) {
      (p.isOwner ? owned : shared).push(p);
    }
    return { owned, shared };
  }, [projects]);

  const isRecentSelected = selection.kind === "recent";

  return (
    <div className={`overflow-y-auto pr-1 ${className ?? ""}`}>
      {!hideRecent && (
        <button
          type="button"
          className={`${rowBase} ${isRecentSelected ? rowActive : rowInactive}`}
          style={{ paddingLeft: `6px` }}
          onClick={() => onSelect({ kind: "recent" })}
        >
          <span className="w-3 shrink-0" />
          <Clock size={12} className="shrink-0 text-default-500" />
          <span className="truncate">{t("assetPicker.recent")}</span>
        </button>
      )}

      {owned.length > 0 && (
        <div className="text-[10px] font-medium text-default-400 uppercase tracking-wider px-2 pt-2 pb-1">
          {t("assetPicker.myProjects")}
        </div>
      )}
      {owned.map((p) => (
        <ProjectNode
          key={p.id}
          project={p}
          collections={collections}
          level={0}
          expanded={expandedProjects.has(p.id)}
          onToggle={() => toggleProject(p.id)}
          expandedCollections={expandedCollections}
          toggleCollection={toggleCollection}
          selection={selection}
          onSelect={onSelect}
        />
      ))}

      {shared.length > 0 && (
        <div className="text-[10px] font-medium text-default-400 uppercase tracking-wider px-2 pt-2 pb-1">
          {t("assetPicker.sharedProjects")}
        </div>
      )}
      {shared.map((p) => (
        <ProjectNode
          key={p.id}
          project={p}
          collections={collections}
          level={0}
          expanded={expandedProjects.has(p.id)}
          onToggle={() => toggleProject(p.id)}
          expandedCollections={expandedCollections}
          toggleCollection={toggleCollection}
          selection={selection}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
