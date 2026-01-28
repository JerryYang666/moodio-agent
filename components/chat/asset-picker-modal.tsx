"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";
import { Image } from "@heroui/image";
import { Tab, Tabs } from "@heroui/tabs";
import { Search, Expand } from "lucide-react";
import { siteConfig } from "@/config/site";

export type AssetSummary = {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  imageUrl: string;
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error";
  };
  addedAt: Date;
};

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

export default function AssetPickerModal({
  isOpen,
  onOpenChange,
  onSelect,
  onUpload,
}: {
  isOpen: boolean;
  onOpenChange: () => void;
  onSelect: (asset: AssetSummary) => void;
  onUpload: (file: File) => void;
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [projectId, setProjectId] = useState<string>("recent");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [tabKey, setTabKey] = useState<"library" | "upload">("library");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetSummary | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPreviewAsset(null);
      return;
    }
    setTabKey("library");
    setUploadError(null);
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
        console.error("Failed to load picker metadata", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  const visibleCollections = useMemo(() => {
    const all = collections;
    if (projectId === "recent") return all;
    return all.filter((c) => c.projectId === projectId);
  }, [collections, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    const loadAssets = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "80");
        if (collectionId !== "all") {
          params.set("collectionId", collectionId);
        } else if (projectId !== "recent") {
          params.set("projectId", projectId);
        }
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
  }, [isOpen, projectId, collectionId]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      (a.generationDetails?.title || "").toLowerCase().includes(q)
    );
  }, [assets, query]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="4xl"
        scrollBehavior="inside"
        classNames={{ base: "max-h-[90dvh]" }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div>{t("assetPicker.title")}</div>
                <Tabs
                  selectedKey={tabKey}
                  onSelectionChange={(k) => setTabKey(k as "library" | "upload")}
                  size="sm"
                  variant="underlined"
                >
                  <Tab key="library" title={t("assetPicker.libraryTab")} />
                  <Tab key="upload" title={t("assetPicker.uploadTab")} />
                </Tabs>
              </ModalHeader>

              <ModalBody className="overflow-hidden">
                {tabKey === "upload" ? (
                  <div className="flex flex-col gap-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/png, image/jpeg, image/webp, image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const maxBytes = siteConfig.upload.maxFileSizeMB * 1024 * 1024;
                        const validTypes = siteConfig.upload.allowedImageTypes;
                        if (file.size > maxBytes) {
                          setUploadError(t("assetPicker.uploadTooLarge", { maxSize: siteConfig.upload.maxFileSizeMB }));
                          e.currentTarget.value = "";
                          return;
                        }
                        if (!validTypes.includes(file.type)) {
                          setUploadError(t("assetPicker.uploadUnsupportedType"));
                          e.currentTarget.value = "";
                          return;
                        }
                        setUploadError(null);
                        onUpload(file);
                        onClose();
                        // allow re-selecting the same file later
                        e.currentTarget.value = "";
                      }}
                    />

                    <div className="rounded-xl border border-divider bg-default-50 p-4">
                      <div className="font-medium">
                        {t("assetPicker.uploadFromDevice")}
                      </div>
                      <div className="text-sm text-default-500 mt-1">
                        {t("assetPicker.uploadDescription", { maxSize: siteConfig.upload.maxFileSizeMB })}
                      </div>
                      {uploadError && (
                        <div className="text-xs text-danger mt-2">
                          {uploadError}
                        </div>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button
                          color="primary"
                          onPress={() => fileInputRef.current?.click()}
                        >
                          {t("assetPicker.chooseFile")}
                        </Button>
                        <Button
                          variant="flat"
                          onPress={() => setTabKey("library")}
                        >
                          {t("assetPicker.browseLibrary")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 min-h-0">
                    <div className="flex flex-col md:flex-row gap-3 shrink-0">
                      <Select
                        label={t("assetPicker.projectLabel")}
                        selectedKeys={[projectId]}
                        onChange={(e) => {
                          const next = e.target.value;
                          setProjectId(next);
                          setCollectionId("all");
                        }}
                        className="md:w-1/2"
                      >
                        <SelectItem key="recent">
                          {t("assetPicker.recent")}
                        </SelectItem>
                        <>
                          {projects.map((p) => (
                            <SelectItem key={p.id}>
                              {p.isDefault
                                ? `${p.name} (${t("assetPicker.defaultSuffix")})`
                                : p.name}
                            </SelectItem>
                          ))}
                        </>
                      </Select>

                      <Select
                        label={t("assetPicker.collectionLabel")}
                        selectedKeys={[collectionId]}
                        onChange={(e) => setCollectionId(e.target.value)}
                        className="md:w-1/2"
                      >
                        <SelectItem key="all">{t("assetPicker.all")}</SelectItem>
                        <>
                          {visibleCollections.map((c) => (
                            <SelectItem key={c.id}>
                              {c.isOwner
                                ? c.name
                                : `${c.name} (${t("assetPicker.sharedSuffix")})`}
                            </SelectItem>
                          ))}
                        </>
                      </Select>
                    </div>

                    <Input
                      startContent={
                        <Search size={16} className="text-default-400" />
                      }
                      placeholder={t("assetPicker.searchByTitle")}
                      value={query}
                      onValueChange={setQuery}
                      className="shrink-0"
                    />

                    {loading ? (
                      <div className="flex items-center justify-center py-10">
                        <Spinner />
                      </div>
                    ) : filteredAssets.length === 0 ? (
                      <div className="text-center py-10 text-default-500">
                        {t("assetPicker.noAssetsFound")}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {filteredAssets.map((a) => (
                            <div key={a.id} className="text-left group">
                              <div className="relative rounded-lg overflow-hidden border border-divider bg-default-100 aspect-square">
                                <button
                                  className="w-full h-full"
                                  onClick={() => {
                                    onSelect(a);
                                    onClose();
                                  }}
                                >
                                  <Image
                                    src={a.imageUrl}
                                    alt={
                                      a.generationDetails?.title ||
                                      t("assetPicker.assetAlt")
                                    }
                                    radius="none"
                                    classNames={{
                                      wrapper: "w-full h-full !max-w-full",
                                      img: "w-full h-full object-cover",
                                    }}
                                  />
                                </button>
                                <button
                                  className="absolute top-1 right-1 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 z-10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewAsset(a);
                                  }}
                                  title={t("assetPicker.viewFull")}
                                >
                                  <Expand size={14} />
                                </button>
                              </div>
                              <button
                                className="w-full mt-1 text-xs text-default-600 truncate text-left"
                                onClick={() => {
                                  onSelect(a);
                                  onClose();
                                }}
                              >
                                {a.generationDetails?.title ||
                                  t("assetPicker.untitled")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("common.close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Full image preview modal */}
      <Modal
        isOpen={!!previewAsset}
        onOpenChange={() => setPreviewAsset(null)}
        size="5xl"
        classNames={{
          base: "bg-black/95",
          closeButton: "text-white hover:bg-white/20",
        }}
      >
        <ModalContent>
          {(onPreviewClose) => (
            <>
              <ModalHeader className="text-white flex items-center justify-between">
                <span className="truncate pr-4">
                  {previewAsset?.generationDetails?.title ||
                    t("assetPicker.untitled")}
                </span>
              </ModalHeader>
              <ModalBody className="flex items-center justify-center p-4">
                {previewAsset && (
                  <Image
                    src={previewAsset.imageUrl}
                    alt={
                      previewAsset.generationDetails?.title ||
                      t("assetPicker.assetAlt")
                    }
                    classNames={{
                      wrapper: "max-w-full max-h-[70vh]",
                      img: "max-w-full max-h-[70vh] object-contain",
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter className="justify-center gap-2">
                <Button
                  variant="flat"
                  className="text-white"
                  onPress={onPreviewClose}
                >
                  {t("common.close")}
                </Button>
                <Button
                  color="primary"
                  onPress={() => {
                    if (previewAsset) {
                      onSelect(previewAsset);
                      setPreviewAsset(null);
                      onOpenChange();
                    }
                  }}
                >
                  {t("assetPicker.selectThisImage")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
