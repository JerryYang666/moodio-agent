"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { Users, Plus } from "lucide-react";
import {
  useGetUserTeamsQuery,
  useCreateTeamMutation,
} from "@/lib/redux/services/next-api";
import { useAuth } from "@/hooks/use-auth";

const ROLE_COLOR_MAP: Record<string, "primary" | "success" | "warning" | "default"> = {
  owner: "primary",
  admin: "success",
  member: "default",
};

export default function TeamsPage() {
  const t = useTranslations();
  const { user } = useAuth();
  const { data: teams, isLoading } = useGetUserTeamsQuery();
  const [createTeam, { isLoading: creating }] = useCreateTeamMutation();
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [teamName, setTeamName] = useState("");

  const handleCreate = async () => {
    const name = teamName.trim();
    if (!name) return;
    try {
      await createTeam({ name }).unwrap();
      addToast({ title: "Team created", color: "success" });
      setTeamName("");
      onClose();
    } catch {
      addToast({ title: "Failed to create team", color: "danger" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("teams.title")}</h1>
        <Button color="primary" startContent={<Plus size={16} />} onPress={onOpen}>
          {t("teams.createTeam")}
        </Button>
      </div>

      {!teams || teams.length === 0 ? (
        <Card className="py-12">
          <CardBody className="flex flex-col items-center gap-4">
            <div className="p-4 bg-default-100 rounded-full">
              <Users size={48} className="text-default-400" />
            </div>
            <p className="text-default-500">{t("teams.noTeams")}</p>
            <Button color="primary" variant="flat" onPress={onOpen}>
              {t("teams.createFirst")}
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Card key={team.teamId} className="hover:shadow-md transition-shadow">
              <CardBody className="gap-2">
                <h3 className="text-lg font-semibold">{team.teamName}</h3>
                <Chip size="sm" variant="flat" color={ROLE_COLOR_MAP[team.role] ?? "default"}>
                  {team.role}
                </Chip>
              </CardBody>
              <CardFooter>
                <Button
                  as={Link}
                  href={`/teams/${team.teamId}`}
                  color="primary"
                  variant="flat"
                  size="sm"
                  className="ml-auto"
                >
                  {t("teams.viewTeam")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onModalClose) => (
            <>
              <ModalHeader>{t("teams.createTeam")}</ModalHeader>
              <ModalBody>
                <Input
                  label={t("teams.teamName")}
                  placeholder={t("teams.teamNamePlaceholder")}
                  value={teamName}
                  onValueChange={setTeamName}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onModalClose}>
                  {t("teams.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={creating}
                  isDisabled={!teamName.trim()}
                  onPress={handleCreate}
                >
                  {t("teams.create")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
