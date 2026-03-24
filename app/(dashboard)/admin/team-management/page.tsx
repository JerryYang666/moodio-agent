"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Card, CardBody, CardHeader } from "@heroui/card";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { Bean, UsersRound, RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";

interface TeamRow {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  createdAt: string;
  memberCount: number;
  balance: number;
}

export default function TeamManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ teams: TeamRow[] }>("/api/admin/teams");
      setTeams(data.teams);
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, color: "danger" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.roles.includes("admin")) {
      fetchTeams();
    }
  }, [user, fetchTeams]);

  const handleAdjustCredits = async (onClose: () => void) => {
    if (!selectedTeam || !creditAmount) return;

    const amount = Number(creditAmount);
    if (isNaN(amount) || amount === 0) {
      addToast({
        title: "Invalid amount",
        description: "Enter a non-zero number",
        color: "warning",
      });
      return;
    }

    setAdjusting(true);
    try {
      await api.post("/api/admin/team-credits", {
        teamId: selectedTeam.id,
        amount,
        description: creditDescription || undefined,
      });
      addToast({
        title: "Credits adjusted",
        description: `${amount > 0 ? "+" : ""}${amount} credits for ${selectedTeam.name}`,
        color: "success",
      });
      setCreditAmount("");
      setCreditDescription("");
      onClose();
      fetchTeams();
    } catch (err: any) {
      addToast({ title: "Error", description: err.message, color: "danger" });
    } finally {
      setAdjusting(false);
    }
  };

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  const ownerDisplay = (t: TeamRow) => {
    const name = [t.ownerFirstName, t.ownerLastName].filter(Boolean).join(" ");
    return name ? `${name} (${t.ownerEmail})` : t.ownerEmail ?? "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Team Management</h1>
        <Button
          variant="flat"
          startContent={<RefreshCw className="w-4 h-4" />}
          onPress={fetchTeams}
          isLoading={loading}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row gap-2 items-center">
          <UsersRound className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">All Teams</h2>
          <span className="text-default-400 text-sm">({teams.length})</span>
        </CardHeader>
        <CardBody>
          {loading ? (
            <Spinner size="lg" className="flex justify-center py-8" />
          ) : teams.length === 0 ? (
            <p className="text-default-500 text-center py-8">
              No teams found.
            </p>
          ) : (
            <Table aria-label="Teams table" removeWrapper>
              <TableHeader>
                <TableColumn>TEAM NAME</TableColumn>
                <TableColumn>OWNER</TableColumn>
                <TableColumn>MEMBERS</TableColumn>
                <TableColumn>CREDIT BALANCE</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell className="text-default-500 max-w-[240px] truncate">
                      {ownerDisplay(team)}
                    </TableCell>
                    <TableCell>{team.memberCount}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Bean className="w-4 h-4 text-warning" />
                        {team.balance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-default-400">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        color="warning"
                        variant="flat"
                        startContent={<Bean className="w-3 h-3" />}
                        onPress={() => {
                          setSelectedTeam(team);
                          setCreditAmount("");
                          setCreditDescription("");
                          onOpen();
                        }}
                      >
                        Adjust Credits
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                Adjust Credits — {selectedTeam?.name}
              </ModalHeader>
              <ModalBody>
                <p className="text-default-500 text-sm mb-2">
                  Current balance:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedTeam?.balance.toLocaleString()}
                  </span>
                </p>
                <Input
                  label="Amount"
                  placeholder="e.g. 500 or -200"
                  type="number"
                  value={creditAmount}
                  onValueChange={setCreditAmount}
                  description="Positive to grant, negative to deduct"
                />
                <Input
                  label="Description (optional)"
                  placeholder="Reason for adjustment"
                  value={creditDescription}
                  onValueChange={setCreditDescription}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={() => handleAdjustCredits(onClose)}
                  isLoading={adjusting}
                  isDisabled={!creditAmount}
                >
                  Apply
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
