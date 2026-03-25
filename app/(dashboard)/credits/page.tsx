"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { Tabs, Tab } from "@heroui/tabs";
import { Bean, CalendarCheck } from "lucide-react";
import NextLink from "next/link";
import { api } from "@/lib/api/client";
import { useCredits } from "@/hooks/use-credits";
import { useTeams } from "@/hooks/use-team";
import { LegalFooter } from "@/components/legal-footer";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
  performedByEmail?: string;
  performedByFirstName?: string;
  performedByLastName?: string;
}

interface CheckinStatus {
  available: boolean;
  amount: number;
  nextAvailable: string | null;
}

export default function CreditsPage() {
  const t = useTranslations("credits");
  const { activeAccountType, activeAccountId, refreshBalance } = useCredits();
  const { teams } = useTeams();

  // Local view state — does NOT change the global billing account
  const [viewAccountType, setViewAccountType] = useState<"personal" | "team">(activeAccountType);
  const [viewAccountId, setViewAccountId] = useState<string | null>(activeAccountId);

  // Sync local view with global active account when it changes externally
  useEffect(() => {
    setViewAccountType(activeAccountType);
    setViewAccountId(activeAccountId);
  }, [activeAccountType, activeAccountId]);

  const [viewBalance, setViewBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null);
  const [claiming, setClaiming] = useState(false);

  const fetchCredits = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (viewAccountType === "team" && viewAccountId) {
        params.set("accountType", "team");
        params.set("accountId", viewAccountId);
      }
      const data = await api.get(`/api/users/credits?${params.toString()}`);
      setViewBalance(data.balance);
      setTransactions(data.transactions);
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      setLoading(false);
    }
  }, [viewAccountType, viewAccountId]);

  const fetchCheckinStatus = useCallback(async () => {
    try {
      const data = await api.get("/api/users/credits/daily-checkin");
      setCheckinStatus(data);
    } catch (error) {
      console.error("Failed to fetch check-in status:", error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCredits();
    if (viewAccountType === "personal") {
      fetchCheckinStatus();
    }
  }, [fetchCredits, fetchCheckinStatus, viewAccountType]);

  const handleCheckin = async () => {
    setClaiming(true);
    try {
      const data = await api.post("/api/users/credits/daily-checkin", {});
      if (data.success) {
        setCheckinStatus({ available: false, amount: data.amount, nextAvailable: null });
        addToast({
          title: t("dailyCheckin.success", { amount: data.amount }),
          color: "success",
        });
        refreshBalance();
        fetchCredits();
      } else if (data.alreadyClaimed) {
        setCheckinStatus({
          available: false,
          amount: checkinStatus?.amount ?? 100,
          nextAvailable: data.nextAvailable,
        });
      }
    } catch (error) {
      console.error("Failed to claim daily check-in:", error);
    } finally {
      setClaiming(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTransactionTypeLabel = (type: string) => {
    const typeKey = type as keyof typeof t.raw;
    const transactionTypes = t.raw("transactionTypes") as Record<string, string>;
    return transactionTypes[type] || type;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
      </div>

      {teams.length > 0 && (
        <Tabs
          selectedKey={viewAccountType === "team" ? `team:${viewAccountId}` : "personal"}
          onSelectionChange={(key) => {
            const keyStr = String(key);
            if (keyStr === "personal") {
              setViewAccountType("personal");
              setViewAccountId(null);
            } else if (keyStr.startsWith("team:")) {
              const teamId = keyStr.slice(5);
              setViewAccountType("team");
              setViewAccountId(teamId);
            }
          }}
          variant="underlined"
          classNames={{ tabList: "gap-4" }}
        >
          <Tab key="personal" title={t("personalAccount")} />
          {teams.map((team) => (
            <Tab key={`team:${team.teamId}`} title={team.teamName} />
          ))}
        </Tabs>
      )}

      {/* Balance Card */}
      <Card className="bg-linear-to-br from-primary/10 to-primary/5">
        <CardBody className="py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-primary/20 rounded-full">
              <Bean size={48} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm text-default-500 mb-1">
                {t("currentBalance")}
              </p>
              <p className="text-4xl font-bold text-primary">
                {viewBalance !== null ? viewBalance.toLocaleString() : "0"}
              </p>
              <p className="text-sm text-default-500 mt-1">
                {t("namePlural")}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Payment Legal Disclosure */}
      <p className="text-xs text-default-500 text-center -mt-4">
        {t("paymentDisclosure")}{" "}
        <NextLink href="/legal/subscription-terms" className="underline hover:text-default-700">
          {t("subscriptionTerms")}
        </NextLink>
        {" "}{t("paymentDisclosureAnd")}{" "}
        <NextLink href="/legal/refunds" className="underline hover:text-default-700">
          {t("refundPolicy")}
        </NextLink>
        .{" "}{t("paymentDisclosureWithdrawal")}
      </p>

      {/* Daily Check-in Card */}
      {viewAccountType === "personal" && checkinStatus && (
        <Card className="bg-linear-to-br from-success/10 to-success/5">
          <CardBody className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-success/20 rounded-full">
                  <CalendarCheck size={28} className="text-success" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{t("dailyCheckin.title")}</h3>
                  <p className="text-sm text-default-500">
                    {checkinStatus.available
                      ? t("dailyCheckin.claim", { amount: checkinStatus.amount })
                      : t("dailyCheckin.nextAvailable")}
                  </p>
                </div>
              </div>
              <Button
                color="success"
                variant={checkinStatus.available ? "solid" : "flat"}
                isDisabled={!checkinStatus.available}
                isLoading={claiming}
                onPress={handleCheckin}
                startContent={!claiming && <Bean size={16} />}
              >
                {checkinStatus.available
                  ? t("dailyCheckin.claim", { amount: checkinStatus.amount })
                  : t("dailyCheckin.claimed")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">{t("transactionHistory")}</h2>
        </CardHeader>
        <CardBody>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-default-400">
              {t("noTransactions")}
            </div>
          ) : (
            <Table aria-label="Transaction history" removeWrapper>
              <TableHeader>
                <TableColumn>{t("date")}</TableColumn>
                <TableColumn>{t("type")}</TableColumn>
                <TableColumn>{t("description")}</TableColumn>
                {viewAccountType === "team"
                  ? <TableColumn>{t("usedBy")}</TableColumn>
                  : <TableColumn className="hidden"><></></TableColumn>
                }
                <TableColumn className="text-right">{t("amount")}</TableColumn>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-default-500 text-sm">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={tx.amount > 0 ? "success" : "warning"}
                      >
                        {getTransactionTypeLabel(tx.type)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-default-500 text-sm">
                      {tx.description || "-"}
                    </TableCell>
                    {viewAccountType === "team"
                      ? <TableCell className="text-default-500 text-sm">
                          {tx.amount > 0
                            ? "-"
                            : tx.performedByFirstName || tx.performedByLastName
                              ? `${tx.performedByFirstName ?? ""} ${tx.performedByLastName ?? ""}`.trim()
                              : tx.performedByEmail ?? "-"}
                        </TableCell>
                      : <TableCell className="hidden"><></></TableCell>
                    }
                    <TableCell className="text-right">
                      <span
                        className={
                          tx.amount > 0 ? "text-success" : "text-danger"
                        }
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <LegalFooter className="pt-8" />
    </div>
  );
}
