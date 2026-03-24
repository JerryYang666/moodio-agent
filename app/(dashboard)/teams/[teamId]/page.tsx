"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
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
  Pencil,
  Trash2,
  UserPlus,
  ChevronDown,
  Bean,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetTeamDetailsQuery,
  useInviteTeamMemberMutation,
  useCancelInvitationMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
} from "@/lib/redux/services/next-api";

const ROLE_COLOR_MAP: Record<string, "primary" | "success" | "warning" | "default"> = {
  owner: "primary",
  admin: "success",
  member: "default",
};

const ROLES = ["admin", "member"] as const;

export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const { data: team, isLoading } = useGetTeamDetailsQuery(teamId);

  const [inviteMember, { isLoading: inviting }] = useInviteTeamMemberMutation();
  const [cancelInvitation] = useCancelInvitationMutation();
  const [removeMember] = useRemoveMemberMutation();
  const [updateRole] = useUpdateMemberRoleMutation();
  const [updateTeam, { isLoading: updating }] = useUpdateTeamMutation();
  const [deleteTeam, { isLoading: deleting }] = useDeleteTeamMutation();

  const renameModal = useDisclosure();
  const deleteModal = useDisclosure();

  const [inviteEmail, setInviteEmail] = useState("");
  const [newTeamName, setNewTeamName] = useState("");

  const currentMember = team?.members.find((m) => m.userId === user?.id);
  const currentRole = currentMember?.role;
  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "admin";
  const canManage = isOwner || isAdmin;

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      await inviteMember({ teamId, email }).unwrap();
      addToast({ title: "Invitation sent", color: "success" });
      setInviteEmail("");
    } catch {
      addToast({ title: "Failed to send invitation", color: "danger" });
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    try {
      await cancelInvitation({ teamId, invitationId }).unwrap();
      addToast({ title: "Invitation cancelled", color: "success" });
    } catch {
      addToast({ title: "Failed to cancel invitation", color: "danger" });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember({ teamId, memberId }).unwrap();
      addToast({ title: "Member removed", color: "success" });
    } catch {
      addToast({ title: "Failed to remove member", color: "danger" });
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await updateRole({ teamId, memberId, role }).unwrap();
      addToast({ title: "Role updated", color: "success" });
    } catch {
      addToast({ title: "Failed to update role", color: "danger" });
    }
  };

  const handleRename = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      await updateTeam({ teamId, name }).unwrap();
      addToast({ title: "Team renamed", color: "success" });
      renameModal.onClose();
    } catch {
      addToast({ title: "Failed to rename team", color: "danger" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTeam(teamId).unwrap();
      addToast({ title: "Team deleted", color: "success" });
      router.push("/teams");
    } catch {
      addToast({ title: "Failed to delete team", color: "danger" });
    }
  };

  if (isLoading || !team) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {currentRole && (
            <Chip size="sm" variant="flat" color={ROLE_COLOR_MAP[currentRole] ?? "default"}>
              {currentRole}
            </Chip>
          )}
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="flat"
              startContent={<Pencil size={16} />}
              onPress={() => {
                setNewTeamName(team.name);
                renameModal.onOpen();
              }}
            >
              {t("teams.rename")}
            </Button>
          )}
          {isOwner && (
            <Button
              color="danger"
              variant="flat"
              startContent={<Trash2 size={16} />}
              onPress={deleteModal.onOpen}
            >
              {t("teams.delete")}
            </Button>
          )}
        </div>
      </div>

      {/* Balance Card */}
      <Card className="bg-linear-to-br from-primary/10 to-primary/5">
        <CardBody className="py-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-full">
              <Bean size={28} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-default-500">{t("teams.teamBalance")}</p>
              <p className="text-3xl font-bold text-primary">
                {team.balance.toLocaleString()}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Members Table */}
      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <h2 className="text-lg font-semibold">{t("teams.members")}</h2>
        </CardHeader>
        <CardBody>
          <Table aria-label="Team members" removeWrapper>
            <TableHeader>
              <TableColumn>{t("teams.name")}</TableColumn>
              <TableColumn>{t("teams.email")}</TableColumn>
              <TableColumn>{t("teams.role")}</TableColumn>
              <TableColumn>{t("teams.actions")}</TableColumn>
            </TableHeader>
            <TableBody>
              {team.members.map((member) => {
                const displayName =
                  [member.firstName, member.lastName].filter(Boolean).join(" ") ||
                  "—";
                const isSelf = member.userId === user?.id;
                const memberIsOwner = member.role === "owner";

                return (
                  <TableRow key={member.id}>
                    <TableCell>{displayName}</TableCell>
                    <TableCell className="text-default-500">{member.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={ROLE_COLOR_MAP[member.role] ?? "default"}
                      >
                        {member.role}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      {canManage && !isSelf && !memberIsOwner ? (
                        <div className="flex gap-2">
                          <Dropdown>
                            <DropdownTrigger>
                              <Button size="sm" variant="flat" endContent={<ChevronDown size={14} />}>
                                {t("teams.changeRole")}
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                              aria-label="Change role"
                              onAction={(key) => handleRoleChange(member.id, key as string)}
                              disabledKeys={[member.role]}
                            >
                              {ROLES.map((role) => (
                                <DropdownItem key={role}>{role}</DropdownItem>
                              ))}
                            </DropdownMenu>
                          </Dropdown>
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            startContent={<Trash2 size={14} />}
                            onPress={() => handleRemoveMember(member.id)}
                          >
                            {t("teams.removeMember")}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-default-300">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Pending Invitations */}
      {team.pendingInvitations.length > 0 && (
        <Card>
          <CardHeader className="pb-0 pt-4 px-4">
            <h2 className="text-lg font-semibold">{t("teams.pendingInvitations")}</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {team.pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-default-50"
                >
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-xs text-default-400">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      startContent={<X size={14} />}
                      onPress={() => handleCancelInvite(inv.id)}
                    >
                      {t("teams.cancel")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Invite Form */}
      {canManage && (
        <Card>
          <CardHeader className="pb-0 pt-4 px-4">
            <h2 className="text-lg font-semibold">{t("teams.inviteMember")}</h2>
          </CardHeader>
          <CardBody>
            <div className="flex gap-3">
              <Input
                type="email"
                placeholder={t("teams.emailPlaceholder")}
                value={inviteEmail}
                onValueChange={setInviteEmail}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInvite();
                }}
              />
              <Button
                color="primary"
                isLoading={inviting}
                isDisabled={!inviteEmail.trim()}
                startContent={!inviting ? <UserPlus size={16} /> : undefined}
                onPress={handleInvite}
              >
                {t("teams.invite")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Rename Modal */}
      <Modal isOpen={renameModal.isOpen} onOpenChange={renameModal.onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("teams.renameTeam")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("teams.teamName")}
                  value={newTeamName}
                  onValueChange={setNewTeamName}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {t("teams.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={updating}
                  isDisabled={!newTeamName.trim()}
                  onPress={handleRename}
                >
                  {t("teams.save")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModal.isOpen} onOpenChange={deleteModal.onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("teams.deleteTeam")}</ModalHeader>
              <ModalBody>
                <p className="text-default-500">{t("teams.deleteTeamConfirm")}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  {t("teams.cancel")}
                </Button>
                <Button color="danger" isLoading={deleting} onPress={handleDelete}>
                  {t("teams.delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
