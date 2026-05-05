"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import { useGetCollectionsQuery } from "@/lib/redux/services/next-api";
import AssetPickerUnifiedTree, {
  type UnifiedSelection,
} from "@/components/chat/asset-picker-unified-tree";

type ApiProject = {
  id: string;
  name: string;
  isDefault: boolean;
};

type TreeProject = {
  id: string;
  name: string;
  isDefault: boolean;
  isOwner: boolean;
};

type Selection =
  | { kind: "projects-root" }
  | { kind: "project"; projectId: string }
  | { kind: "collection"; projectId: string; collectionId: string }
  | { kind: "folder"; projectId: string; collectionId: string; folderId: string };

/**
 * Sidebar tree that navigates between /projects, /projects/:id, /collection/:id,
 * and /folder/:id. Reuses AssetPickerUnifiedTree but translates tree clicks
 * into URL navigation instead of picker selection.
 *
 * Why: replaces the low-fidelity "Back to project" button navigation with a
 * persistent tree so users can jump around without climbing up first.
 */
export default function ProjectsNavTree({
  selection,
  className,
}: {
  selection: Selection;
  className?: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<TreeProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const { data: collections = [], isLoading: collectionsLoading } =
    useGetCollectionsQuery();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const owned: TreeProject[] = (data.projects ?? []).map(
          (p: ApiProject) => ({
            id: p.id,
            name: p.name,
            isDefault: p.isDefault,
            isOwner: true,
          })
        );
        const shared: TreeProject[] = (data.sharedProjects ?? []).map(
          (p: ApiProject) => ({
            id: p.id,
            name: p.name,
            isDefault: p.isDefault,
            isOwner: false,
          })
        );
        setProjects([...owned, ...shared]);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const treeSelection = useMemo<UnifiedSelection>(() => {
    switch (selection.kind) {
      case "project":
        return { kind: "project", projectId: selection.projectId };
      case "collection":
        return {
          kind: "collection",
          projectId: selection.projectId,
          collectionId: selection.collectionId,
        };
      case "folder":
        return {
          kind: "folder",
          projectId: selection.projectId,
          collectionId: selection.collectionId,
          folderId: selection.folderId,
          folderRoot: false,
        };
      default:
        // "projects-root" has no matching UnifiedSelection — return a sentinel
        // the tree won't highlight (no project, collection, or folder match).
        return { kind: "recent" };
    }
  }, [selection]);

  const onSelect = (s: UnifiedSelection) => {
    if (s.kind === "project") {
      router.push(`/projects/${s.projectId}`);
    } else if (s.kind === "collection") {
      router.push(`/collection/${s.collectionId}`);
    } else if (s.kind === "folder") {
      if (s.folderId) router.push(`/folder/${s.folderId}`);
      else router.push(`/collection/${s.collectionId}`);
    }
    // "recent" shouldn't happen since we pass hideRecent
  };

  const loading = projectsLoading || collectionsLoading;

  if (loading && projects.length === 0) {
    return (
      <div className={`flex justify-center py-4 ${className ?? ""}`}>
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <AssetPickerUnifiedTree
      projects={projects}
      collections={collections}
      selection={treeSelection}
      onSelect={onSelect}
      className={className}
      hideRecent
    />
  );
}

export type ProjectsNavSelection = Selection;
