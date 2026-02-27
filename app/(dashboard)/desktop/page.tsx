"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@heroui/card";
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
import { addToast } from "@heroui/toast";
import {
  Plus,
  LayoutDashboard,
  Trash2,
  Pencil,
  MoreVertical,
} from "lucide-react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { useDesktops } from "@/hooks/use-desktop";

export default function DesktopListPage() {
  const router = useRouter();
  const { desktops, loading, fetchDesktops, createDesktop, deleteDesktop, renameDesktop } =
    useDesktops();

  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onOpenChange: onCreateOpenChange,
  } = useDisclosure();

  const [desktopToDelete, setDesktopToDelete] = useState<string | null>(null);
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onOpenChange: onDeleteOpenChange,
  } = useDisclosure();

  const [desktopToRename, setDesktopToRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();

  useEffect(() => {
    fetchDesktops();
  }, [fetchDesktops]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const desktop = await createDesktop(newName.trim());
      onCreateOpenChange();
      setNewName("");
      router.push(`/desktop/${desktop.id}`);
    } catch {
      addToast({
        title: "Error",
        description: "Failed to create desktop",
        color: "danger",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!desktopToDelete) return;
    try {
      await deleteDesktop(desktopToDelete);
      onDeleteOpenChange();
      setDesktopToDelete(null);
    } catch {
      addToast({
        title: "Error",
        description: "Failed to delete desktop",
        color: "danger",
      });
    }
  };

  const handleRename = async () => {
    if (!desktopToRename || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await renameDesktop(desktopToRename.id, renameValue.trim());
      onRenameOpenChange();
      setDesktopToRename(null);
    } catch {
      addToast({
        title: "Error",
        description: "Failed to rename desktop",
        color: "danger",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  if (loading && desktops.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Desktops</h1>
          <p className="text-default-500 mt-1">
            Infinite canvases for arranging your generated assets
          </p>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={18} />}
          onPress={onCreateOpen}
        >
          New Desktop
        </Button>
      </div>

      {desktops.length === 0 ? (
        <div className="text-center py-20">
          <LayoutDashboard
            size={48}
            className="mx-auto text-default-300 mb-4"
          />
          <p className="text-default-500 mb-4">
            You don&apos;t have any desktops yet
          </p>
          <Button color="primary" onPress={onCreateOpen}>
            Create your first desktop
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {desktops.map((desktop) => (
            <Card
              key={desktop.id}
              className="group"
            >
              <CardBody
                className="p-4 cursor-pointer"
                onClick={() => router.push(`/desktop/${desktop.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <LayoutDashboard
                        size={18}
                        className="text-primary shrink-0"
                      />
                      <h3 className="font-semibold truncate">{desktop.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip
                        size="sm"
                        variant="flat"
                        color={desktop.isOwner ? "primary" : "default"}
                      >
                        {desktop.permission}
                      </Chip>
                      <span className="text-xs text-default-400">
                        {new Date(desktop.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {desktop.isOwner && (
                    <div
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="Desktop actions">
                          <DropdownItem
                            key="rename"
                            startContent={<Pencil size={16} />}
                            onPress={() => {
                              setDesktopToRename({
                                id: desktop.id,
                                name: desktop.name,
                              });
                              setRenameValue(desktop.name);
                              onRenameOpen();
                            }}
                          >
                            Rename
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-danger"
                            color="danger"
                            startContent={<Trash2 size={16} />}
                            onPress={() => {
                              setDesktopToDelete(desktop.id);
                              onDeleteOpen();
                            }}
                          >
                            Delete
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={onCreateOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Create New Desktop</ModalHeader>
              <ModalBody>
                <Input
                  label="Desktop name"
                  placeholder="My Canvas"
                  value={newName}
                  onValueChange={setNewName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
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
                  onPress={handleCreate}
                  isLoading={isCreating}
                  isDisabled={!newName.trim()}
                >
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Desktop</ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete this desktop? All assets on it
                  will be removed. This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDelete}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={isRenameOpen} onOpenChange={onRenameOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Rename Desktop</ModalHeader>
              <ModalBody>
                <Input
                  label="Desktop name"
                  value={renameValue}
                  onValueChange={setRenameValue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
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
                  onPress={handleRename}
                  isLoading={isRenaming}
                  isDisabled={!renameValue.trim()}
                >
                  Rename
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
