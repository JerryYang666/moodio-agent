"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Folder, Plus, Share2, FolderOpen, MoreVertical, Pencil } from "lucide-react";

type Project = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  coverImageUrl: string | null;
};

type Collection = {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permission: "owner" | "collaborator" | "viewer";
  isOwner: boolean;
  sharedAt?: Date;
  coverImageUrl: string | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const t = useTranslations();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const sharedCollections = useMemo(
    () => collections.filter((c) => !c.isOwner),
    [collections]
  );

  useEffect(() => {
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
        console.error("Failed to load projects/collections", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const project: Project | undefined = data.project;
      if (project) {
        setProjects((prev) => [project, ...prev]);
        setNewProjectName("");
        onOpenChange();
        router.push(`/projects/${project.id}`);
      }
    } catch (e) {
      console.error("Error creating project", e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameProject = async () => {
    if (!projectToRename || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/projects/${projectToRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.project) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectToRename.id ? { ...p, name: data.project.name } : p
          )
        );
        onRenameOpenChange();
        setProjectToRename(null);
        setRenameValue("");
      }
    } catch (e) {
      console.error("Error renaming project", e);
    } finally {
      setIsRenaming(false);
    }
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
          <h1 className="text-3xl font-bold">{t("projects.title")}</h1>
          <p className="text-default-500 mt-1">
            {t("projects.subtitle")}
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={20} />}
          onPress={() => {
            setNewProjectName("My Project");
            onOpen();
          }}
          className="w-full sm:w-auto"
        >
          {t("projects.newProject")}
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen size={64} className="mx-auto mb-4 text-default-300" />
          <h2 className="text-xl font-semibold mb-2">{t("projects.noProjectsYet")}</h2>
          <p className="text-default-500 mb-6">
            {t("projects.createFirstProject")}
          </p>
          <Button
            color="primary"
            startContent={<Plus size={20} />}
            onPress={() => {
              setNewProjectName("My Project");
              onOpen();
            }}
          >
            {t("projects.createProject")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              isPressable
              onPress={() => router.push(`/projects/${project.id}`)}
              className="hover:scale-105 transition-transform group"
            >
              <CardBody className="p-3 pb-1 relative">
                <div className="w-full h-40 bg-default-100 rounded-lg overflow-hidden">
                  {project.coverImageUrl ? (
                    <Image
                      src={project.coverImageUrl}
                      alt={project.name}
                      radius="none"
                      classNames={{
                        wrapper: "w-full h-full !max-w-full",
                        img: "w-full h-full object-cover",
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <Folder size={48} className="text-default-400" />
                    </div>
                  )}
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="solid"
                        className="bg-background/80 backdrop-blur-sm"
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Project actions">
                      <DropdownItem
                        key="rename"
                        startContent={<Pencil size={16} />}
                        onPress={() => {
                          setProjectToRename(project);
                          setRenameValue(project.name);
                          onRenameOpen();
                        }}
                      >
                        {t("common.rename")}
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </CardBody>
              <CardFooter className="flex flex-col items-start gap-1 px-3 pt-1 pb-3">
                <h3 className="font-semibold text-base truncate w-full">
                  {project.name}
                </h3>
                <div className="flex items-center gap-2">
                  {project.isDefault && (
                    <Chip size="sm" variant="flat" color="primary">
                      {t("projects.default")}
                    </Chip>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {sharedCollections.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Share2 size={18} className="text-default-500" />
            <h2 className="text-lg font-semibold">{t("projects.sharedCollections")}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sharedCollections.map((c) => (
              <Card
                key={c.id}
                isPressable
                onPress={() => router.push(`/collection/${c.id}`)}
              >
                <CardBody className="p-3 pb-1">
                  <div className="w-full h-36 bg-default-100 rounded-lg overflow-hidden">
                    {c.coverImageUrl ? (
                      <Image
                        src={c.coverImageUrl}
                        alt={c.name}
                        radius="none"
                        classNames={{
                          wrapper: "w-full h-full !max-w-full",
                          img: "w-full h-full object-cover",
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full">
                        <Folder size={40} className="text-default-400" />
                      </div>
                    )}
                  </div>
                </CardBody>
                <CardFooter className="flex flex-col items-start gap-1 px-3 pt-1 pb-3">
                  <h3 className="font-semibold text-base truncate w-full">
                    {c.name}
                  </h3>
                  <Chip size="sm" variant="flat" color="secondary">
                    {c.permission}
                  </Chip>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("projects.createNewProject")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("projects.projectName")}
                  placeholder={t("projects.enterProjectName")}
                  value={newProjectName}
                  onValueChange={setNewProjectName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateProject();
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateProject}
                  isLoading={isCreating}
                  isDisabled={!newProjectName.trim()}
                >
                  {t("common.create")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={isRenameOpen} onOpenChange={onRenameOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("projects.renameProject")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("projects.projectName")}
                  placeholder={t("projects.enterProjectName")}
                  value={renameValue}
                  onValueChange={setRenameValue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameProject();
                  }}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleRenameProject}
                  isLoading={isRenaming}
                  isDisabled={!renameValue.trim()}
                >
                  {t("common.rename")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
