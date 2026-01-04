"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Search } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [projectId, setProjectId] = useState<string>("recent");
  const [collectionId, setCollectionId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [tabKey, setTabKey] = useState<"library" | "upload">("library");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTabKey("library");
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
              <div>Select an image</div>
              <Tabs
                selectedKey={tabKey}
                onSelectionChange={(k) => setTabKey(k as "library" | "upload")}
                size="sm"
                variant="underlined"
              >
                <Tab key="library" title="Library" />
                <Tab key="upload" title="Upload" />
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
                      onUpload(file);
                      onClose();
                      // allow re-selecting the same file later
                      e.currentTarget.value = "";
                    }}
                  />

                  <div className="rounded-xl border border-divider bg-default-50 p-4">
                    <div className="font-medium">Upload from device</div>
                    <div className="text-sm text-default-500 mt-1">
                      Choose an image file to attach to your next message.
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        color="primary"
                        onPress={() => fileInputRef.current?.click()}
                      >
                        Choose file
                      </Button>
                      <Button variant="flat" onPress={() => setTabKey("library")}>
                        Browse library instead
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 min-h-0">
                  <div className="flex flex-col md:flex-row gap-3 shrink-0">
                    <Select
                      label="Project"
                      selectedKeys={[projectId]}
                      onChange={(e) => {
                        const next = e.target.value;
                        setProjectId(next);
                        setCollectionId("all");
                      }}
                      className="md:w-1/2"
                    >
                      <SelectItem key="recent">Recent</SelectItem>
                      <>
                        {projects.map((p) => (
                          <SelectItem key={p.id}>
                            {p.isDefault ? `${p.name} (Default)` : p.name}
                          </SelectItem>
                        ))}
                      </>
                    </Select>

                    <Select
                      label="Collection"
                      selectedKeys={[collectionId]}
                      onChange={(e) => setCollectionId(e.target.value)}
                      className="md:w-1/2"
                    >
                      <SelectItem key="all">All</SelectItem>
                      <>
                        {visibleCollections.map((c) => (
                          <SelectItem key={c.id}>
                            {c.isOwner ? c.name : `${c.name} (Shared)`}
                          </SelectItem>
                        ))}
                      </>
                    </Select>
                  </div>

                  <Input
                    startContent={
                      <Search size={16} className="text-default-400" />
                    }
                    placeholder="Search by title…"
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
                      No assets found
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {filteredAssets.map((a) => (
                          <button
                            key={a.id}
                            className="text-left group"
                            onClick={() => {
                              onSelect(a);
                              onClose();
                            }}
                          >
                            <div className="rounded-lg overflow-hidden border border-divider bg-default-100 aspect-square">
                              <Image
                                src={a.imageUrl}
                                alt={a.generationDetails?.title || "Asset"}
                                radius="none"
                                classNames={{
                                  wrapper: "w-full h-full !max-w-full",
                                  img: "w-full h-full object-cover",
                                }}
                              />
                            </div>
                            <div className="mt-1 text-xs text-default-600 truncate">
                              {a.generationDetails?.title || "Untitled"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}


