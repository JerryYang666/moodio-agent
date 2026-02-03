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
import { Chip } from "@heroui/chip";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { SearchIcon } from "@/components/icons";
import { addToast } from "@heroui/toast";
import { Users, Trash2, Edit2, Plus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface TestingGroup {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

interface LookupResult {
  email: string;
  found: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface GroupUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export default function TestingGroupsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("admin.testingGroups");
  const tCommon = useTranslations("common");
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

  // Add Users Modal State
  const {
    isOpen: isAddUsersOpen,
    onOpen: onAddUsersOpen,
    onOpenChange: onAddUsersOpenChange,
    onClose: onAddUsersClose,
  } = useDisclosure();
  const [emailInput, setEmailInput] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [addingUsers, setAddingUsers] = useState(false);

  // View/Manage Users Modal State
  const {
    isOpen: isViewUsersOpen,
    onOpen: onViewUsersOpen,
    onOpenChange: onViewUsersOpenChange,
    onClose: onViewUsersClose,
  } = useDisclosure();
  const [groupUsers, setGroupUsers] = useState<GroupUser[]>([]);
  const [loadingGroupUsers, setLoadingGroupUsers] = useState(false);
  const [removingUsers, setRemovingUsers] = useState<Set<string>>(new Set());

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
        title: t("toastError"),
        description: t("fetchError"),
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
        title: t("toastError"),
        description: t("nameRequired"),
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
          title: t("toastSuccess"),
          description: t("createSuccess"),
          color: "success",
        });
      } else if (selectedGroup) {
        await api.patch(`/api/admin/testing-groups/${selectedGroup.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        });
        addToast({
          title: t("toastSuccess"),
          description: t("updateSuccess"),
          color: "success",
        });
      }
      await fetchGroups();
      onEditClose();
    } catch (error) {
      console.error("Failed to save testing group:", error);
      addToast({
        title: t("toastError"),
        description:
          error instanceof Error ? error.message : t("saveError"),
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
        title: t("toastSuccess"),
        description: t("deleteSuccess"),
        color: "success",
      });
      await fetchGroups();
      onDeleteClose();
    } catch (error) {
      console.error("Failed to delete testing group:", error);
      addToast({
        title: t("toastError"),
        description: t("deleteError"),
        color: "danger",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Add Users handlers
  const handleOpenAddUsers = (group: TestingGroup) => {
    setSelectedGroup(group);
    setEmailInput("");
    setLookupResults([]);
    onAddUsersOpen();
  };

  const handleLookupEmails = async () => {
    if (!emailInput.trim()) return;

    // Parse emails from input (support newlines, commas, spaces)
    const emails = emailInput
      .split(/[\n,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes("@"));

    if (emails.length === 0) {
      addToast({
        title: t("toastError"),
        description: t("noValidEmails"),
        color: "danger",
      });
      return;
    }

    setLookingUp(true);
    try {
      const data = await api.post("/api/admin/users/lookup", { emails });
      setLookupResults(data.results);
      
      if (data.summary.notFound > 0) {
        addToast({
          title: t("lookupPartialSuccess"),
          description: t("lookupSummary", { found: data.summary.found, notFound: data.summary.notFound }),
          color: "warning",
        });
      }
    } catch (error) {
      console.error("Failed to lookup emails:", error);
      addToast({
        title: t("toastError"),
        description: t("lookupError"),
        color: "danger",
      });
    } finally {
      setLookingUp(false);
    }
  };

  const handleRemoveLookupResult = (email: string) => {
    setLookupResults((prev) => prev.filter((r) => r.email !== email));
  };

  const handleAddUsersToGroup = async () => {
    if (!selectedGroup) return;

    const userIds = lookupResults
      .filter((r) => r.found && r.user)
      .map((r) => r.user!.id);

    if (userIds.length === 0) {
      addToast({
        title: t("toastError"),
        description: t("noValidUsers"),
        color: "danger",
      });
      return;
    }

    setAddingUsers(true);
    try {
      const result = await api.post(
        `/api/admin/testing-groups/${selectedGroup.id}/users`,
        { userIds }
      );
      addToast({
        title: t("toastSuccess"),
        description: t("addUsersSuccess", { added: result.addedCount }) + (result.alreadyInGroupCount > 0 ? t("addUsersAlreadyInGroup", { count: result.alreadyInGroupCount }) : ""),
        color: "success",
      });
      await fetchGroups();
      onAddUsersClose();
    } catch (error) {
      console.error("Failed to add users to group:", error);
      addToast({
        title: t("toastError"),
        description: t("addUsersError"),
        color: "danger",
      });
    } finally {
      setAddingUsers(false);
    }
  };

  // View/Manage Users handlers
  const handleViewUsers = async (group: TestingGroup) => {
    setSelectedGroup(group);
    setGroupUsers([]);
    setLoadingGroupUsers(true);
    onViewUsersOpen();

    try {
      const data = await api.get(`/api/admin/testing-groups/${group.id}/users`);
      setGroupUsers(data.users);
    } catch (error) {
      console.error("Failed to fetch group users:", error);
      addToast({
        title: t("toastError"),
        description: t("fetchUsersError"),
        color: "danger",
      });
    } finally {
      setLoadingGroupUsers(false);
    }
  };

  const handleRemoveUserFromGroup = async (userId: string) => {
    if (!selectedGroup) return;

    setRemovingUsers((prev) => new Set(prev).add(userId));
    try {
      await api.delete(`/api/admin/testing-groups/${selectedGroup.id}/users`, {
        userIds: [userId],
      });
      setGroupUsers((prev) => prev.filter((u) => u.id !== userId));
      await fetchGroups();
      addToast({
        title: t("toastSuccess"),
        description: t("removeUserSuccess"),
        color: "success",
      });
    } catch (error) {
      console.error("Failed to remove user from group:", error);
      addToast({
        title: t("toastError"),
        description: t("removeUserError"),
        color: "danger",
      });
    } finally {
      setRemovingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  // Helper to get user display name
  const getUserDisplayName = (user: GroupUser | LookupResult["user"]) => {
    if (!user) return "Unknown";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.firstName || user.email;
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
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <Button
          color="primary"
          startContent={<Plus size={16} />}
          onPress={handleCreate}
        >
          {t("createGroup")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("manageGroups")}</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder={t("searchPlaceholder")}
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table
              aria-label={t("tableAriaLabel")}
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
                <TableColumn>{t("columnName")}</TableColumn>
                <TableColumn>{t("columnDescription")}</TableColumn>
                <TableColumn>{t("columnUsers")}</TableColumn>
                <TableColumn>{t("columnCreated")}</TableColumn>
                <TableColumn>{t("columnActions")}</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : t("noGroupsFound")}
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
                      <Button
                        size="sm"
                        variant="light"
                        className="gap-1"
                        onPress={() => handleViewUsers(item)}
                      >
                        <Users size={16} className="text-default-400" />
                        <span>{item.userCount}</span>
                      </Button>
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          isIconOnly
                          onPress={() => handleOpenAddUsers(item)}
                          title={t("addUsersTitle")}
                        >
                          <UserPlus size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          isIconOnly
                          onPress={() => handleEdit(item)}
                          title={t("editGroupTitle")}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          isIconOnly
                          onPress={() => handleDeleteClick(item)}
                          title={t("deleteGroupTitle")}
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
                {isCreating ? t("createGroupModal") : t("editGroupModal")}
              </ModalHeader>
              <ModalBody>
                <Input
                  label={t("nameLabel")}
                  placeholder={t("namePlaceholder")}
                  value={formData.name}
                  onValueChange={(v) => setFormData({ ...formData, name: v })}
                  maxLength={50}
                  isRequired
                />
                <Textarea
                  label={t("descriptionLabel")}
                  placeholder={t("descriptionPlaceholder")}
                  value={formData.description}
                  onValueChange={(v) =>
                    setFormData({ ...formData, description: v })
                  }
                  minRows={2}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={saving}
                  isDisabled={!formData.name.trim()}
                >
                  {isCreating ? tCommon("create") : tCommon("save")}
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
              <ModalHeader>{t("deleteGroupModal")}</ModalHeader>
              <ModalBody>
                <p>
                  {t("deleteConfirm")}{" "}
                  <strong>{selectedGroup?.name}</strong>?
                </p>
                {selectedGroup && selectedGroup.userCount > 0 && (
                  <p className="text-warning text-sm mt-2">
                    {t("deleteUserWarning", { count: selectedGroup.userCount })}
                  </p>
                )}
                <p className="text-danger text-sm mt-2">
                  {t("deleteCannotUndo")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="danger"
                  onPress={handleDelete}
                  isLoading={deleting}
                >
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add Users Modal */}
      <Modal
        isOpen={isAddUsersOpen}
        onOpenChange={onAddUsersOpenChange}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {t("addUsersModal", { groupName: selectedGroup?.name ?? "" })}
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-2">
                  {t("emailInstructions")}
                </p>
                <Textarea
                  label={t("emailLabel")}
                  placeholder={t("emailPlaceholder")}
                  value={emailInput}
                  onValueChange={setEmailInput}
                  minRows={3}
                  maxRows={6}
                />
                <Button
                  color="primary"
                  variant="flat"
                  onPress={handleLookupEmails}
                  isLoading={lookingUp}
                  isDisabled={!emailInput.trim()}
                >
                  {t("lookupUsers")}
                </Button>

                {lookupResults.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">
                      {t("foundUsers", { found: lookupResults.filter((r) => r.found).length, total: lookupResults.length })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {lookupResults.map((result) => (
                        <Chip
                          key={result.email}
                          size="sm"
                          variant="flat"
                          color={result.found ? "success" : "danger"}
                          onClose={() => handleRemoveLookupResult(result.email)}
                        >
                          {result.found && result.user
                            ? getUserDisplayName(result.user)
                            : result.email}
                          {!result.found && ` (${t("notFound")})`}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleAddUsersToGroup}
                  isLoading={addingUsers}
                  isDisabled={
                    lookupResults.filter((r) => r.found).length === 0
                  }
                >
                  {t("addUsersButton", { count: lookupResults.filter((r) => r.found).length })}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* View/Manage Users Modal */}
      <Modal
        isOpen={isViewUsersOpen}
        onOpenChange={onViewUsersOpenChange}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex justify-between items-center">
                <span>{t("viewUsersModal", { groupName: selectedGroup?.name ?? "" })}</span>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  startContent={<UserPlus size={14} />}
                  onPress={() => {
                    onViewUsersClose();
                    if (selectedGroup) handleOpenAddUsers(selectedGroup);
                  }}
                >
                  {t("addUsers")}
                </Button>
              </ModalHeader>
              <ModalBody>
                {loadingGroupUsers ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : groupUsers.length === 0 ? (
                  <p className="text-center text-default-500 py-8">
                    {t("noUsersInGroup")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupUsers.map((groupUser) => (
                      <div
                        key={groupUser.id}
                        className="flex items-center justify-between p-3 bg-default-100 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {getUserDisplayName(groupUser)}
                          </p>
                          <p className="text-sm text-default-500">
                            {groupUser.email}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          isIconOnly
                          isLoading={removingUsers.has(groupUser.id)}
                          onPress={() => handleRemoveUserFromGroup(groupUser.id)}
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
