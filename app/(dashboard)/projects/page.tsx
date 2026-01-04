"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Folder, Plus, Share2, FolderOpen } from "lucide-react";

type Project = {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
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
};

export default function ProjectsPage() {
  const router = useRouter();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-default-500 mt-1">
            Organize assets with Projects and Collections
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
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen size={64} className="mx-auto mb-4 text-default-300" />
          <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
          <p className="text-default-500 mb-6">
            Create your first project to start organizing assets
          </p>
          <Button
            color="primary"
            startContent={<Plus size={20} />}
            onPress={() => {
              setNewProjectName("My Project");
              onOpen();
            }}
          >
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              isPressable
              onPress={() => router.push(`/projects/${project.id}`)}
              className="hover:scale-105 transition-transform"
            >
              <CardBody className="p-4">
                <div className="flex items-center justify-center w-full h-32 bg-default-100 rounded-lg mb-0">
                  <Folder size={48} className="text-default-400" />
                </div>
              </CardBody>
              <CardFooter className="flex flex-col items-start gap-1 px-4 pb-4">
                <h3 className="font-semibold text-base truncate w-full">
                  {project.name}
                </h3>
                <div className="flex items-center gap-2">
                  {project.isDefault && (
                    <Chip size="sm" variant="flat" color="primary">
                      Default
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
            <h2 className="text-lg font-semibold">Shared collections</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sharedCollections.map((c) => (
              <Card
                key={c.id}
                isPressable
                onPress={() => router.push(`/collection/${c.id}`)}
              >
                <CardBody className="p-4">
                  <div className="flex items-center justify-center w-full h-28 bg-default-100 rounded-lg mb-0">
                    <Folder size={40} className="text-default-400" />
                  </div>
                </CardBody>
                <CardFooter className="flex flex-col items-start gap-1 px-4 pb-4">
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
              <ModalHeader>Create New Project</ModalHeader>
              <ModalBody>
                <Input
                  label="Project Name"
                  placeholder="Enter project name"
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
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleCreateProject}
                  isLoading={isCreating}
                  isDisabled={!newProjectName.trim()}
                >
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}


