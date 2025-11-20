"use client";

import { useEffect, useState } from "react";
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

interface InvitationCode {
  code: string;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Invite Email State
  const {
    isOpen: isInviteOpen,
    onOpen: onInviteOpen,
    onOpenChange: onInviteOpenChange,
  } = useDisclosure();
  const [inviteEmails, setInviteEmails] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

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
    onClose: onEditClose
  } = useDisclosure();
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    roles: [] as string[],
  });
  const [savingUser, setSavingUser] = useState(false);

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

  const handleSendInvites = async () => {
    setSendingInvites(true);
    setInviteResult(null);
    try {
      // Split by newlines, commas, spaces
      const emails = inviteEmails
        .split(/[\n, ]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const response = await api.post("/api/admin/invite-email", { emails });
      setInviteResult(`Successfully sent ${response.count} invitations.`);
      setInviteEmails("");
    } catch (error) {
      setInviteResult(
        error instanceof Error ? error.message : "Failed to send invitations"
      );
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
    } catch (error) {
      console.error("Failed to generate codes:", error);
    } finally {
      setGeneratingCodes(false);
    }
  };

  const handleEditUser = (userToEdit: User) => {
    setSelectedUser(userToEdit);
    setEditFormData({
      firstName: userToEdit.firstName || "",
      lastName: userToEdit.lastName || "",
      roles: userToEdit.roles,
    });
    onEditOpen();
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
    } catch (error) {
      console.error("Failed to update user:", error);
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Button color="primary" variant="flat" onPress={onCodeOpen}>
            Generate Codes
          </Button>
          <Button color="primary" onPress={onInviteOpen}>
            Invite Users
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">User Management</h2>
        </CardHeader>
        <CardBody>
          <Table aria-label="User table">
            <TableHeader>
              <TableColumn>USER</TableColumn>
              <TableColumn>ROLES</TableColumn>
              <TableColumn>PROVIDER</TableColumn>
              <TableColumn>JOINED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : "No users found"}
              items={users}
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
                          item.firstName?.charAt(0) ||
                          item.email.charAt(0)
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
                  <TableCell className="capitalize">
                    {item.authProvider}
                  </TableCell>
                  <TableCell>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => handleEditUser(item)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
                  Enter email addresses separated by newlines, commas, or spaces.
                  This will send a blind copy (BCC) invitation email to all
                  recipients.
                </p>
                <Textarea
                  label="Emails"
                  placeholder="user@example.com, another@example.com"
                  minRows={4}
                  value={inviteEmails}
                  onValueChange={setInviteEmails}
                />
                {inviteResult && (
                  <p
                    className={`text-sm ${
                      inviteResult.includes("Failed")
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {inviteResult}
                  </p>
                )}
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
    </div>
  );
}

