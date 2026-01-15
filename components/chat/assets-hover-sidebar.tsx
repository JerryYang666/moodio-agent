"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import { Folder, Clock, Images, ChevronLeft } from "lucide-react";
import clsx from "clsx";

type Project = {
  id: string;
  name: string;
  isDefault: boolean;
};

type Collection = {
  id: string;
  name: string;
  projectId: string;
  isOwner: boolean;
  permission: "owner" | "collaborator" | "viewer";
};

type Asset = {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  imageUrl: string;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  addedAt: Date;
};

type AssetDragPayload = {
  assetId: string;
  imageId: string;
  url: string;
  title: string;
};

const DRAG_MIME = "application/x-moodio-asset";
const SELECT_EVENT = "moodio-asset-selected";

export default function AssetsHoverSidebar() {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scope, setScope] = useState<
    | { kind: "recent" }
    | { kind: "project"; id: string }
    | { kind: "collection"; id: string }
  >({ kind: "recent" });

  const ownedCollectionsByProject = useMemo(() => {
    const map = new Map<string, Collection[]>();
    for (const c of collections) {
      if (!c.isOwner) continue;
      const arr = map.get(c.projectId) || [];
      arr.push(c);
      map.set(c.projectId, arr);
    }
    return map;
  }, [collections]);

  const sharedCollections = useMemo(
    () => collections.filter((c) => !c.isOwner),
    [collections]
  );

  useEffect(() => {
    // Load metadata once when mounted.
    const load = async () => {
      setLoading(true);
      try {
        const [projectsRes, collectionsRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/collection"),
        ]);
        if (projectsRes.ok) {
          const data = await projectsRes.json();
          setProjects(data.projects || []);
        }
        if (collectionsRes.ok) {
          const data = await collectionsRes.json();
          setCollections(data.collections || []);
        }
      } catch (e) {
        console.error("Failed to load assets sidebar metadata", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadAssets = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "60");
        if (scope.kind === "project") params.set("projectId", scope.id);
        if (scope.kind === "collection") params.set("collectionId", scope.id);
        const res = await fetch(`/api/assets?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setAssets(data.assets || []);
      } catch (e) {
        console.error("Failed to load assets", e);
      } finally {
        setLoading(false);
      }
    };
    loadAssets();
  }, [scope]);

  const handlePick = (asset: Asset) => {
    const payload: AssetDragPayload = {
      assetId: asset.id,
      imageId: asset.imageId,
      url: asset.imageUrl,
      title: asset.generationDetails?.title || t("chat.selectedAsset"),
    };
    window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: payload }));
  };

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    const payload: AssetDragPayload = {
      assetId: asset.id,
      imageId: asset.imageId,
      url: asset.imageUrl,
      title: asset.generationDetails?.title || t("chat.selectedAsset"),
    };
    try {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    } catch {}
    e.dataTransfer.setData("text/plain", asset.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="hidden lg:block absolute inset-y-0 right-0 z-50">
      {/* Hover handle with glow indicator */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute right-0 top-0 h-full w-10 cursor-pointer group"
            onMouseEnter={() => setIsOpen(true)}
          >
            {/* Glowing edge effect */}
            <div className="absolute right-0 top-0 h-full w-1 bg-linear-to-l from-primary/40 to-transparent" />
            <motion.div
              className="absolute right-0 top-0 h-full w-6 bg-linear-to-l from-primary/20 to-transparent"
              animate={{
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Icon indicator */}
            <motion.div
              className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
              animate={{
                x: [0, -3, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div className="bg-default-100/60 backdrop-blur-md border border-default-200/50 rounded-lg p-1.5 group-hover:bg-default-200/70 transition-colors">
                <Images size={16} className="text-default-500" />
              </div>
              <ChevronLeft size={12} className="text-default-400" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="absolute right-0 top-0 h-full w-[360px] bg-background border-l border-divider shadow-2xl"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-divider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder size={18} className="text-default-500" />
                  <div className="font-semibold">
                    {t("assetsSidebar.title")}
                  </div>
                </div>
                <Chip size="sm" variant="flat" color="secondary">
                  {t("assetsSidebar.dragOrClick")}
                </Chip>
              </div>

              <div className="p-3 border-b border-divider flex flex-col gap-2">
                <Button
                  size="sm"
                  variant={scope.kind === "recent" ? "solid" : "flat"}
                  color={scope.kind === "recent" ? "primary" : "default"}
                  startContent={<Clock size={16} />}
                  onPress={() => setScope({ kind: "recent" })}
                >
                  {t("assetsSidebar.recent")}
                </Button>

                <div className="text-xs text-default-500 mt-2">
                  {t("assetsSidebar.projects")}
                </div>
                <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
                  {projects.map((p) => (
                    <div key={p.id} className="flex flex-col">
                      <button
                        className={clsx(
                          "w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors",
                          scope.kind === "project" && scope.id === p.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-default-100 text-default-700"
                        )}
                        onClick={() => setScope({ kind: "project", id: p.id })}
                      >
                        <span className="truncate">
                          {p.isDefault
                            ? `${p.name} (${t("assetsSidebar.defaultSuffix")})`
                            : p.name}
                        </span>
                      </button>
                      {(ownedCollectionsByProject.get(p.id) || []).map((c) => (
                        <button
                          key={c.id}
                          className={clsx(
                            "ml-3 w-[calc(100%-12px)] text-left px-2 py-1 rounded-md text-xs transition-colors",
                            scope.kind === "collection" && scope.id === c.id
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-default-100 text-default-600"
                          )}
                          onClick={() =>
                            setScope({ kind: "collection", id: c.id })
                          }
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>

                {sharedCollections.length > 0 && (
                  <>
                    <div className="text-xs text-default-500 mt-2">
                      {t("assetsSidebar.sharedCollections")}
                    </div>
                    <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                      {sharedCollections.map((c) => (
                        <button
                          key={c.id}
                          className={clsx(
                            "w-full text-left px-2 py-1 rounded-md text-xs transition-colors",
                            scope.kind === "collection" && scope.id === c.id
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-default-100 text-default-600"
                          )}
                          onClick={() =>
                            setScope({ kind: "collection", id: c.id })
                          }
                        >
                          {c.name}{" "}
                          <span className="opacity-70">
                            ({t(`assetsSidebar.permissions.${c.permission}`)})
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Spinner />
                  </div>
                ) : assets.length === 0 ? (
                  <div className="text-center py-10 text-default-500 text-sm">
                    {t("assetsSidebar.noAssets")}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {assets.map((a) => (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, a)}
                        className="group cursor-grab active:cursor-grabbing"
                        onClick={() => handlePick(a)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="rounded-lg overflow-hidden border border-divider bg-default-100 aspect-square">
                          <Image
                            src={a.imageUrl}
                            alt={
                              a.generationDetails?.title ||
                              t("assetsSidebar.assetAlt")
                            }
                            radius="none"
                            classNames={{
                              wrapper: "w-full h-full !max-w-full",
                              img: "w-full h-full object-cover",
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-default-600 truncate">
                          {a.generationDetails?.title ||
                            t("assetsSidebar.untitled")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export { DRAG_MIME, SELECT_EVENT };
