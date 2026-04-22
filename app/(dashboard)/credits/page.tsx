"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
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
import { Pagination } from "@heroui/pagination";
import { Tooltip } from "@heroui/tooltip";
import { Select, SelectItem } from "@heroui/select";
import { Bean, CalendarCheck, MessageSquare, Eye } from "lucide-react";
import { api } from "@/lib/api/client";
import { useCredits } from "@/hooks/use-credits";
import { useTeams } from "@/hooks/use-team";
import { useAuth } from "@/hooks/use-auth";
import { LegalFooter } from "@/components/legal-footer";
import CreditPackageCards from "@/components/credits/CreditPackageCards";
import VideoDetailModal, { type VideoDetailData } from "@/components/video/video-detail-modal";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
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

interface Performer {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export default function CreditsPage() {
  const t = useTranslations("credits");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeAccountType, activeAccountId, refreshBalance } = useCredits();
  const { teams, isOwnerOrAdmin } = useTeams();
  const { user } = useAuth();

  // Local view state — does NOT change the global billing account
  const [viewAccountType, setViewAccountType] = useState<"personal" | "team">(activeAccountType);
  const [viewAccountId, setViewAccountId] = useState<string | null>(activeAccountId);

  // Sync local view with global active account when it changes externally
  useEffect(() => {
    setViewAccountType(activeAccountType);
    setViewAccountId(activeAccountId);
    setPage(1);
    setPerformedByFilter(null);
  }, [activeAccountType, activeAccountId]);

  const [viewBalance, setViewBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchingPage, setFetchingPage] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [performedByFilter, setPerformedByFilter] = useState<string | null>(null);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [totalUsage, setTotalUsage] = useState<number | null>(null);
  const rowsPerPage = 20;

  // Video detail modal state
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoModalData, setVideoModalData] = useState<VideoDetailData | null>(null);
  const [videoModalLoading, setVideoModalLoading] = useState(false);

  const handleViewVideoGeneration = async (generationId: string) => {
    setVideoModalLoading(true);
    setVideoModalOpen(true);
    try {
      const params = new URLSearchParams();
      if (viewAccountType === "team" && viewAccountId) {
        params.set("teamId", viewAccountId);
      }
      const data = await api.get(`/api/video/generations/${generationId}?${params.toString()}`);
      setVideoModalData(data.generation);
    } catch {
      addToast({ title: "Failed to load video generation", color: "danger" });
      setVideoModalOpen(false);
    } finally {
      setVideoModalLoading(false);
    }
  };

  const handleViewChat = (chatId: string) => {
    const teamParam = viewAccountType === "team" && viewAccountId ? `?teamId=${viewAccountId}` : "";
    router.push(`/chat/${chatId}${teamParam}`);
  };

  const fetchCredits = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (viewAccountType === "team" && viewAccountId) {
        params.set("accountType", "team");
        params.set("accountId", viewAccountId);
        if (performedByFilter) {
          params.set("performedBy", performedByFilter);
        }
      }
      params.set("page", String(page));
      params.set("limit", String(rowsPerPage));
      const data = await api.get(`/api/users/credits?${params.toString()}`);
      setViewBalance(data.balance);
      setTransactions(data.transactions);
      setTotalPages(Math.max(1, Math.ceil((data.totalCount ?? 0) / rowsPerPage)));
      setTotalUsage(typeof data.totalUsage === "number" ? data.totalUsage : null);
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      setInitialLoading(false);
      setFetchingPage(false);
    }
  }, [viewAccountType, viewAccountId, page, performedByFilter]);

  const fetchCheckinStatus = useCallback(async () => {
    try {
      const data = await api.get("/api/users/credits/daily-checkin");
      setCheckinStatus(data);
    } catch (error) {
      console.error("Failed to fetch check-in status:", error);
    }
  }, []);

  const fetchPerformers = useCallback(async () => {
    if (viewAccountType !== "team" || !viewAccountId) {
      setPerformers([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        accountType: "team",
        accountId: viewAccountId,
      });
      const data = await api.get(`/api/users/credits/performers?${params.toString()}`);
      const list: Performer[] = data.performers ?? [];
      const sorted = [...list].sort((a, b) => {
        const nameA =
          (a.firstName || a.lastName
            ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim()
            : a.email) || "";
        const nameB =
          (b.firstName || b.lastName
            ? `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim()
            : b.email) || "";
        return nameA.localeCompare(nameB);
      });
      setPerformers(sorted);
    } catch (error) {
      console.error("Failed to fetch performers:", error);
      setPerformers([]);
    }
  }, [viewAccountType, viewAccountId]);

  useEffect(() => {
    setFetchingPage(true);
    fetchCredits();
    if (viewAccountType === "personal") {
      fetchCheckinStatus();
    }
  }, [fetchCredits, fetchCheckinStatus, viewAccountType]);

  useEffect(() => {
    fetchPerformers();
  }, [fetchPerformers]);

  const checkoutHandled = useRef(false);

  useEffect(() => {
    if (checkoutHandled.current) return;
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      checkoutHandled.current = true;
      addToast({ title: t("purchaseSuccess"), color: "success" });
      refreshBalance();
      fetchCredits();
      window.history.replaceState(null, "", window.location.pathname);
    } else if (checkout === "canceled") {
      checkoutHandled.current = true;
      addToast({ title: t("purchaseCanceled"), color: "warning" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams, t, refreshBalance, fetchCredits]);

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

  const showActions = viewAccountType === "team" && viewAccountId && isOwnerOrAdmin(viewAccountId);

  if (initialLoading) {
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
            setPage(1);
            setPerformedByFilter(null);
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

      {/* Buy Credits */}
      {viewAccountType === "personal" && user && (
        <CreditPackageCards
          accountType="personal"
          accountId={user.id}
        />
      )}
      {viewAccountType === "team" && viewAccountId && isOwnerOrAdmin(viewAccountId) && (
        <CreditPackageCards
          accountType="team"
          accountId={viewAccountId}
          teamName={teams.find((t) => t.teamId === viewAccountId)?.teamName}
        />
      )}

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
        <CardHeader className="pb-0 pt-4 px-4 flex-row items-start justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">{t("transactionHistory")}</h2>
          {viewAccountType === "team" && (
            <div className="flex flex-col items-end gap-1 w-full sm:w-64">
              <Select
                aria-label={t("filterByUser")}
                size="sm"
                className="w-full"
                selectedKeys={performedByFilter ? [performedByFilter] : ["__all"]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0] as string | undefined;
                  setPerformedByFilter(!key || key === "__all" ? null : key);
                  setPage(1);
                }}
              >
                {[
                  <SelectItem key="__all">{t("allUsers")}</SelectItem>,
                  ...performers.map((p) => (
                    <SelectItem key={p.userId}>
                      {p.firstName || p.lastName
                        ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()
                        : p.email || p.userId}
                    </SelectItem>
                  )),
                ]}
              </Select>
              {performedByFilter && totalUsage !== null && (
                <p className="text-sm text-default-500 flex items-center gap-1">
                  <span>{t("totalUsage")}:</span>
                  <span className="font-semibold text-danger">
                    -{totalUsage.toLocaleString()}
                  </span>
                  <Bean size={14} className="text-danger" />
                </p>
              )}
            </div>
          )}
        </CardHeader>
        <CardBody>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-default-400 flex flex-col items-center gap-3">
              <span>
                {performedByFilter
                  ? t("noTransactionsForFilter")
                  : t("noTransactions")}
              </span>
              {performedByFilter && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    setPerformedByFilter(null);
                    setPage(1);
                  }}
                >
                  {t("clearFilter")}
                </Button>
              )}
            </div>
          ) : (
            <Table
              aria-label="Transaction history"
              removeWrapper
              bottomContent={
                totalPages > 1 ? (
                  <div className="flex w-full justify-center">
                    <Pagination
                      isCompact
                      showControls
                      showShadow
                      color="primary"
                      page={page}
                      total={totalPages}
                      onChange={setPage}
                    />
                  </div>
                ) : null
              }
            >
              <TableHeader>
                <TableColumn>{t("date")}</TableColumn>
                <TableColumn>{t("type")}</TableColumn>
                <TableColumn>{t("description")}</TableColumn>
                {viewAccountType === "team"
                  ? <TableColumn>{t("usedBy")}</TableColumn>
                  : <TableColumn className="hidden"><></></TableColumn>
                }
                <TableColumn className="text-right">{t("amount")}</TableColumn>
                {showActions
                  ? <TableColumn className="w-12">{""}</TableColumn>
                  : <TableColumn className="hidden"><></></TableColumn>
                }
              </TableHeader>
              <TableBody
                isLoading={fetchingPage}
                loadingContent={<Spinner size="sm" />}
              >
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
                    {showActions
                      ? <TableCell>
                          {tx.type === "image_generation" && tx.relatedEntityType === "chat" && tx.relatedEntityId ? (
                            <Tooltip content={t("viewChat")}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleViewChat(tx.relatedEntityId!)}
                              >
                                <MessageSquare size={16} />
                              </Button>
                            </Tooltip>
                          ) : tx.type === "video_generation" && tx.relatedEntityType === "video_generation" && tx.relatedEntityId ? (
                            <Tooltip content={t("viewGeneration")}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleViewVideoGeneration(tx.relatedEntityId!)}
                              >
                                <Eye size={16} />
                              </Button>
                            </Tooltip>
                          ) : null}
                        </TableCell>
                      : <TableCell className="hidden"><></></TableCell>
                    }
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <LegalFooter className="pt-8" />

      <VideoDetailModal
        video={videoModalData}
        isOpen={videoModalOpen}
        onClose={() => {
          setVideoModalOpen(false);
          setVideoModalData(null);
        }}
      />
    </div>
  );
}
