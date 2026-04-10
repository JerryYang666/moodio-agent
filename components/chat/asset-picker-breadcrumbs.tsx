"use client";

import { ChevronRight } from "lucide-react";
import { nextApi } from "@/lib/redux/services/next-api";

export default function AssetPickerBreadcrumbs({
  collectionName,
  folderId,
  onNavigate,
}: {
  collectionName: string | null;
  folderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const { data: breadcrumbData } = nextApi.useGetFolderBreadcrumbsQuery(
    folderId!,
    { skip: !folderId }
  );

  if (!folderId || !breadcrumbData) return null;

  const crumbs = breadcrumbData.breadcrumbs ?? [];

  return (
    <div className="flex items-center gap-0.5 text-xs text-default-500 overflow-x-auto shrink-0 min-h-[20px]">
      {crumbs.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight size={10} className="text-default-300" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.name}</span>
          ) : (
            <button
              type="button"
              className="hover:text-primary hover:underline cursor-pointer"
              onClick={() =>
                onNavigate(crumb.type === "folder" ? crumb.id : null)
              }
            >
              {crumb.name}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
