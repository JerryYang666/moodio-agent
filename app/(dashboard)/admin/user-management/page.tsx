"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { User as UserAvatar } from "@heroui/user";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { User } from "@/hooks/use-auth";
import { Pagination } from "@heroui/pagination";
import { SearchIcon } from "@/components/icons";
import { addToast } from "@heroui/toast";
import { Bean } from "lucide-react";

interface InvitationCode {
  code: string;
  status: string;
  createdAt: string;
}

interface UserWithCredits extends User {
  credits: number;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("credits");
  const [users, setUsers] = useState<UserWithCredits[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithCredits | null>(null);

  // Pagination & Search State
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Invite Email State
  const {
    isOpen: isInviteOpen,
    onOpen: onInviteOpen,
    onOpenChange: onInviteOpenChange,
  } = useDisclosure();
  const [inviteEmails, setInviteEmails] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);

  // Generate Code State
  const {
    isOpen: isCodeOpen,
    onOpen: onCodeOpen,
    onOpenChange: onCodeOpenChange,
  } = useDisclosure();
  const [codeCount, setCodeCount] = useState("1");
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<InvitationCode[]>([]);

  // Edit User State
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onOpenChange: onEditOpenChange,
    onClose: onEditClose,
  } = useDisclosure();
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    roles: [] as string[],
  });
  const [savingUser, setSavingUser] = useState(false);

  // Add Credits State
  const {
    isOpen: isCreditsOpen,
    onOpen: onCreditsOpen,
    onOpenChange: onCreditsOpenChange,
    onClose: onCreditsClose,
  } = useDisclosure();
  const [creditsAmount, setCreditsAmount] = useState("");
  const [creditsDescription, setCreditsDescription] = useState("");
  const [addingCredits, setAddingCredits] = useState(false);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const data = await api.get("/api/admin/users");
      setUsers(data.users);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredItems = useMemo(() => {
    let filteredUsers = [...users];

    if (filterValue) {
      filteredUsers = filteredUsers.filter(
        (user) =>
          user.email.toLowerCase().includes(filterValue.toLowerCase()) ||
          (user.firstName &&
            user.firstName.toLowerCase().includes(filterValue.toLowerCase())) ||
          (user.lastName &&
            user.lastName.toLowerCase().includes(filterValue.toLowerCase()))
      );
    }

    return filteredUsers;
  }, [users, filterValue]);

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

  const handleSendInvites = async () => {
    setSendingInvites(true);
    try {
      // Split by newlines, commas, spaces
      const emails = inviteEmails
        .split(/[\n, ]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const response = await api.post("/api/admin/invite-email", { emails });
      addToast({
        title: "Success",
        description: `Successfully sent ${response.count} invitations.`,
        color: "success",
      });
      setInviteEmails("");
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to send invitations",
        color: "danger",
      });
    } finally {
      setSendingInvites(false);
    }
  };

  const handleGenerateCodes = async () => {
    setGeneratingCodes(true);
    try {
      const response = await api.post("/api/admin/invitation-codes", {
        count: parseInt(codeCount),
      });
      setGeneratedCodes(response.codes);
      addToast({
        title: "Success",
        description: "Successfully generated invitation codes.",
        color: "success",
      });
    } catch (error) {
      console.error("Failed to generate codes:", error);
      addToast({
        title: "Error",
        description: "Failed to generate codes",
        color: "danger",
      });
    } finally {
      setGeneratingCodes(false);
    }
  };

  const handleEditUser = (userToEdit: UserWithCredits) => {
    setSelectedUser(userToEdit);
    setEditFormData({
      firstName: userToEdit.firstName || "",
      lastName: userToEdit.lastName || "",
      roles: userToEdit.roles,
    });
    onEditOpen();
  };

  const handleOpenCreditsModal = (userToEdit: UserWithCredits) => {
    setSelectedUser(userToEdit);
    setCreditsAmount("");
    setCreditsDescription("");
    onCreditsOpen();
  };

  const handleAddCredits = async () => {
    if (!selectedUser || !creditsAmount) return;
    setAddingCredits(true);
    try {
      await api.post("/api/admin/credits", {
        userId: selectedUser.id,
        amount: parseInt(creditsAmount),
        description: creditsDescription || null,
      });
      await fetchUsers();
      onCreditsClose();
      addToast({
        title: "Success",
        description: t("grantSuccess", { amount: creditsAmount }),
        color: "success",
      });
    } catch (error) {
      console.error("Failed to add credits:", error);
      addToast({
        title: "Error",
        description: t("grantError"),
        color: "danger",
      });
    } finally {
      setAddingCredits(false);
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    try {
      await api.patch(`/api/admin/users/${selectedUser.id}`, {
        firstName: editFormData.firstName || null,
        lastName: editFormData.lastName || null,
        roles: editFormData.roles,
      });
      await fetchUsers();
      onEditClose();
      addToast({
        title: "Success",
        description: "User updated successfully.",
        color: "success",
      });
    } catch (error) {
      console.error("Failed to update user:", error);
      addToast({
        title: "Error",
        description: "Failed to update user",
        color: "danger",
      });
    } finally {
      setSavingUser(false);
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
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            color="primary"
            variant="flat"
            onPress={onCodeOpen}
            className="w-full sm:w-auto"
          >
            Generate Codes
          </Button>
          <Button
            color="primary"
            onPress={onInviteOpen}
            className="w-full sm:w-auto"
          >
            Invite Users
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">User Management</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder="Search by name or email..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table
              aria-label="User table"
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
                <TableColumn>USER</TableColumn>
                <TableColumn>ROLES</TableColumn>
                <TableColumn>CREDITS</TableColumn>
                <TableColumn>PROVIDER</TableColumn>
                <TableColumn>JOINED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : "No users found"}
                items={items}
              >
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <UserAvatar
                        name={
                          item.firstName && item.lastName
                            ? `${item.firstName} ${item.lastName}`
                            : item.firstName || item.email
                        }
                        description={item.email}
                        avatarProps={{
                          name: (
                            item.firstName?.charAt(0) || item.email.charAt(0)
                          ).toUpperCase(),
                          color: "primary",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.roles.map((role) => (
                          <Chip
                            key={role}
                            size="sm"
                            variant="flat"
                            color={
                              role === "admin"
                                ? "danger"
                                : role === "new_user"
                                  ? "warning"
                                  : "primary"
                            }
                          >
                            {role}
                          </Chip>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Bean size={16} className="text-primary" />
                        <span className="font-medium">
                          {item.credits.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.authProvider}
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => handleEditUser(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="success"
                          startContent={<Bean size={14} />}
                          onPress={() => handleOpenCreditsModal(item)}
                        >
                          {t("addCredits")}
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

      {/* Email Invite Modal */}
      <Modal isOpen={isInviteOpen} onOpenChange={onInviteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Invite Users via Email</ModalHeader>
              <ModalBody>
                <p className="text-sm text-gray-500">
                  Enter email addresses separated by newlines, commas, or
                  spaces. This will send a blind copy (BCC) invitation email to
                  all recipients.
                </p>
                <Textarea
                  label="Emails"
                  placeholder="user@example.com, another@example.com"
                  minRows={4}
                  value={inviteEmails}
                  onValueChange={setInviteEmails}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button
                  color="primary"
                  onPress={handleSendInvites}
                  isLoading={sendingInvites}
                  isDisabled={!inviteEmails.trim()}
                >
                  Send Invites
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Generate Codes Modal */}
      <Modal
        isOpen={isCodeOpen}
        onOpenChange={onCodeOpenChange}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Generate Invitation Codes</ModalHeader>
              <ModalBody>
                <div className="flex items-end gap-4 mb-4">
                  <Input
                    type="number"
                    label="Number of codes"
                    value={codeCount}
                    onValueChange={setCodeCount}
                    min={1}
                    max={100}
                  />
                  <Button
                    color="primary"
                    onPress={handleGenerateCodes}
                    isLoading={generatingCodes}
                  >
                    Generate
                  </Button>
                </div>

                {generatedCodes.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">
                        Generated Codes:
                      </span>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => {
                          const text = generatedCodes
                            .map((c) => c.code)
                            .join("\n");
                          navigator.clipboard.writeText(text);
                          addToast({
                            title: "Copied",
                            description: "Codes copied to clipboard",
                            color: "default",
                          });
                        }}
                      >
                        Copy All
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                      {generatedCodes.map((code) => (
                        <div
                          key={code.code}
                          className="p-2 bg-white dark:bg-gray-800 border rounded text-center font-mono text-lg tracking-wider"
                        >
                          {code.code}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button onPress={onClose}>Done</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={isEditOpen} onOpenChange={onEditOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit User</ModalHeader>
              <ModalBody>
                <div className="flex gap-4">
                  <Input
                    label="First Name"
                    value={editFormData.firstName}
                    onValueChange={(v) =>
                      setEditFormData({ ...editFormData, firstName: v })
                    }
                  />
                  <Input
                    label="Last Name"
                    value={editFormData.lastName}
                    onValueChange={(v) =>
                      setEditFormData({ ...editFormData, lastName: v })
                    }
                  />
                </div>
                <Select
                  label="Roles"
                  selectionMode="multiple"
                  selectedKeys={new Set(editFormData.roles)}
                  onSelectionChange={(keys) =>
                    setEditFormData({
                      ...editFormData,
                      roles: Array.from(keys) as string[],
                    })
                  }
                >
                  <SelectItem key="user">User</SelectItem>
                  <SelectItem key="admin">Admin</SelectItem>
                  <SelectItem key="new_user">New User</SelectItem>
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSaveUser}
                  isLoading={savingUser}
                >
                  Save Changes
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add Credits Modal */}
      <Modal isOpen={isCreditsOpen} onOpenChange={onCreditsOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("addCredits")}</ModalHeader>
              <ModalBody>
                {selectedUser && (
                  <div className="mb-4 p-3 bg-default-100 rounded-lg">
                    <p className="text-sm text-default-500">User</p>
                    <p className="font-medium">
                      {selectedUser.firstName && selectedUser.lastName
                        ? `${selectedUser.firstName} ${selectedUser.lastName}`
                        : selectedUser.firstName || selectedUser.email}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <Bean size={16} className="text-primary" />
                      <span className="text-sm">
                        {t("currentBalance")}:{" "}
                        <span className="font-medium">
                          {selectedUser.credits.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
                <Input
                  type="number"
                  label={t("amount")}
                  placeholder="100"
                  value={creditsAmount}
                  onValueChange={setCreditsAmount}
                  startContent={<Bean size={16} className="text-default-400" />}
                />
                <Textarea
                  label={t("description")}
                  placeholder={t("descriptionPlaceholder")}
                  value={creditsDescription}
                  onValueChange={setCreditsDescription}
                  minRows={2}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="success"
                  onPress={handleAddCredits}
                  isLoading={addingCredits}
                  isDisabled={!creditsAmount || parseInt(creditsAmount) === 0}
                  startContent={<Bean size={16} />}
                >
                  {t("addCredits")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
