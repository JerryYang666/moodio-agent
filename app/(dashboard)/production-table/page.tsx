"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  Table2,
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

interface TableItem {
  id: string;
  name: string;
  userId: string;
  teamId: string | null;
  permission: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ProductionTableListPage() {
  const router = useRouter();
  const t = useTranslations("productionTable");
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTableName, setNewTableName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TableItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const createModal = useDisclosure();
  const deleteModal = useDisclosure();
  const renameModal = useDisclosure();

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch("/api/production-table");
      if (!res.ok) throw new Error("Failed to fetch tables");
      const data = await res.json();
      setTables(data.tables ?? []);
    } catch {
      addToast({ title: "Failed to load tables", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleCreate = async () => {
    if (!newTableName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/production-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTableName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create table");
      const data = await res.json();
      setTables((prev) => [data.table, ...prev]);
      createModal.onClose();
      setNewTableName("");
      addToast({ title: t("create") + " ✓", color: "success" });
    } catch {
      addToast({ title: "Failed to create table", color: "danger" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/production-table/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete table");
      setTables((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      deleteModal.onClose();
      setDeleteTarget(null);
    } catch {
      addToast({ title: "Failed to delete table", color: "danger" });
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/production-table/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename table");
      const data = await res.json();
      setTables((prev) =>
        prev.map((t) =>
          t.id === renameTarget.id ? { ...t, name: data.table.name } : t
        )
      );
      renameModal.onClose();
      setRenameTarget(null);
    } catch {
      addToast({ title: "Failed to rename table", color: "danger" });
    } finally {
      setRenaming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <Button
          color="primary"
          startContent={<Plus size={16} />}
          onPress={createModal.onOpen}
        >
          {t("create")}
        </Button>
      </div>

      {tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-default-400">
          <Table2 size={48} className="mb-4" />
          <p className="text-lg">{t("title")}</p>
          <Button
            className="mt-4"
            color="primary"
            variant="flat"
            startContent={<Plus size={16} />}
            onPress={createModal.onOpen}
          >
            {t("create")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((table) => (
            <Card
              key={table.id}
              isPressable
              className="hover:shadow-md transition-shadow"
              onPress={() => router.push(`/production-table/${table.id}`)}
            >
              <CardBody className="flex flex-row items-center gap-3">
                <Table2 size={20} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{table.name}</p>
                  <p className="text-xs text-default-400">
                    {new Date(table.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!table.isOwner && (
                    <Chip size="sm" variant="flat" color="secondary">
                      {table.permission}
                    </Chip>
                  )}
                  {table.isOwner && (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                        >
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        onAction={(key) => {
                          if (key === "rename") {
                            setRenameTarget(table);
                            setRenameName(table.name);
                            renameModal.onOpen();
                          } else if (key === "delete") {
                            setDeleteTarget(table);
                            deleteModal.onOpen();
                          }
                        }}
                      >
                        <DropdownItem key="rename" startContent={<Pencil size={14} />}>
                          Rename
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 size={14} />}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={createModal.isOpen} onOpenChange={createModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>{t("create")}</ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              label={t("title")}
              value={newTableName}
              onValueChange={setNewTableName}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={createModal.onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={creating}
              isDisabled={!newTableName.trim()}
              onPress={handleCreate}
            >
              {t("create")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={deleteModal.isOpen} onOpenChange={deleteModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>Delete Table</ModalHeader>
          <ModalBody>
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>? This action cannot be
              undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={deleteModal.onClose}>
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={deleting}
              onPress={handleDelete}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={renameModal.isOpen} onOpenChange={renameModal.onOpenChange}>
        <ModalContent>
          <ModalHeader>Rename Table</ModalHeader>
          <ModalBody>
            <Input
              autoFocus
              label="Name"
              value={renameName}
              onValueChange={setRenameName}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={renameModal.onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={renaming}
              isDisabled={!renameName.trim()}
              onPress={handleRename}
            >
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
