"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { SearchIcon } from "@/components/icons";
import { addToast } from "@heroui/toast";
import { Users, Trash2, Edit2, Plus } from "lucide-react";

interface TestingGroup {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function TestingGroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<TestingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<TestingGroup | null>(null);

  // Pagination & Search State
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // Create/Edit Modal State
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onOpenChange: onEditOpenChange,
    onClose: onEditClose,
  } = useDisclosure();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Delete Confirmation Modal
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onOpenChange: onDeleteOpenChange,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchGroups();
    }
  }, [user]);

  const fetchGroups = async () => {
    try {
      const data = await api.get("/api/admin/testing-groups");
      setGroups(data.groups);
    } catch (error) {
      console.error("Failed to fetch testing groups:", error);
      addToast({
        title: "Error",
        description: "Failed to fetch testing groups",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredItems = useMemo(() => {
    let filtered = [...groups];
    if (filterValue) {
      filtered = filtered.filter(
        (group) =>
          group.name.toLowerCase().includes(filterValue.toLowerCase()) ||
          (group.description &&
            group.description.toLowerCase().includes(filterValue.toLowerCase()))
      );
    }
    return filtered;
  }, [groups, filterValue]);

  // Pagination logic
  const pages = Math.ceil(filteredItems.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredItems.slice(start, end);
  }, [page, filteredItems, rowsPerPage]);

  const onSearchChange = useCallback((value?: string) => {
    if (value) {
      setFilterValue(value);
      setPage(1);
    } else {
      setFilterValue("");
    }
  }, []);

  const onClear = useCallback(() => {
    setFilterValue("");
    setPage(1);
  }, []);

  const handleCreate = () => {
    setIsCreating(true);
    setSelectedGroup(null);
    setFormData({ name: "", description: "" });
    onEditOpen();
  };

  const handleEdit = (group: TestingGroup) => {
    setIsCreating(false);
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || "",
    });
    onEditOpen();
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      addToast({
        title: "Error",
        description: "Name is required",
        color: "danger",
      });
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        await api.post("/api/admin/testing-groups", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        });
        addToast({
          title: "Success",
          description: "Testing group created successfully",
          color: "success",
        });
      } else if (selectedGroup) {
        await api.patch(`/api/admin/testing-groups/${selectedGroup.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        });
        addToast({
          title: "Success",
          description: "Testing group updated successfully",
          color: "success",
        });
      }
      await fetchGroups();
      onEditClose();
    } catch (error) {
      console.error("Failed to save testing group:", error);
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save testing group",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (group: TestingGroup) => {
    setSelectedGroup(group);
    onDeleteOpen();
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;

    setDeleting(true);
    try {
      await api.delete(`/api/admin/testing-groups/${selectedGroup.id}`);
      addToast({
        title: "Success",
        description: "Testing group deleted successfully",
        color: "success",
      });
      await fetchGroups();
      onDeleteClose();
    } catch (error) {
      console.error("Failed to delete testing group:", error);
      addToast({
        title: "Error",
        description: "Failed to delete testing group",
        color: "danger",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 sm:gap-0">
        <h1 className="text-2xl font-bold">Testing Groups</h1>
        <Button
          color="primary"
          startContent={<Plus size={16} />}
          onPress={handleCreate}
        >
          Create Group
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Manage Testing Groups</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder="Search by name or description..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table
              aria-label="Testing groups table"
              bottomContent={
                pages > 0 ? (
                  <div className="flex w-full justify-center">
                    <Pagination
                      isCompact
                      showControls
                      showShadow
                      color="primary"
                      page={page}
                      total={pages}
                      onChange={(page) => setPage(page)}
                    />
                  </div>
                ) : null
              }
            >
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>DESCRIPTION</TableColumn>
                <TableColumn>USERS</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : "No testing groups found"}
                items={items}
              >
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-default-500 text-sm line-clamp-2">
                        {item.description || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users size={16} className="text-default-400" />
                        <span>{item.userCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          isIconOnly
                          onPress={() => handleEdit(item)}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          isIconOnly
                          onPress={() => handleDeleteClick(item)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {/* Create/Edit Modal */}
      <Modal isOpen={isEditOpen} onOpenChange={onEditOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {isCreating ? "Create Testing Group" : "Edit Testing Group"}
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Name"
                  placeholder="e.g., beta_testers"
                  value={formData.name}
                  onValueChange={(v) => setFormData({ ...formData, name: v })}
                  maxLength={50}
                  isRequired
                />
                <Textarea
                  label="Description"
                  placeholder="Describe the purpose of this group..."
                  value={formData.description}
                  onValueChange={(v) =>
                    setFormData({ ...formData, description: v })
                  }
                  minRows={2}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={saving}
                  isDisabled={!formData.name.trim()}
                >
                  {isCreating ? "Create" : "Save Changes"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Testing Group</ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete the testing group{" "}
                  <strong>{selectedGroup?.name}</strong>?
                </p>
                {selectedGroup && selectedGroup.userCount > 0 && (
                  <p className="text-warning text-sm mt-2">
                    This group has {selectedGroup.userCount} user(s) assigned.
                    They will be removed from this group.
                  </p>
                )}
                <p className="text-danger text-sm mt-2">
                  This action cannot be undone. All flag overrides for this
                  group will also be deleted.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleDelete}
                  isLoading={deleting}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
