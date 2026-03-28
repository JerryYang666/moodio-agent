"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { addToast } from "@heroui/toast";
import { Link } from "@heroui/link";
import {
  CreditCard,
  ExternalLink,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";

interface PaymentItem {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  status: string;
  receiptUrl: string | null;
  type: "subscription" | "credit_purchase";
}

const STATUS_COLOR: Record<string, "success" | "warning" | "danger" | "default"> = {
  paid: "success",
  open: "warning",
  void: "danger",
  draft: "default",
  uncollectible: "danger",
  unknown: "default",
};

export default function PaymentsPage() {
  const t = useTranslations("payments");
  const { user, loading: authLoading } = useAuth();
  const { hasSubscription, subscription } = useSubscription();

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    if (user) fetchPayments();
  }, [user]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/stripe/payments");
      setPayments(data.payments ?? []);
    } catch {
      addToast({ title: t("fetchError"), color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const pages = Math.ceil(payments.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return payments.slice(start, start + rowsPerPage);
  }, [page, payments]);

  const handleManageSubscription = async () => {
    try {
      const { url } = await api.post("/api/stripe/portal");
      if (url) window.location.href = url;
    } catch {
      addToast({ title: t("portalError"), color: "danger" });
    }
  };

  const formatAmount = (cents: number, currency: string) => {
    if (cents === 0) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
        <p className="text-default-500">{t("subtitle")}</p>
      </div>

      {/* Subscription Status Card */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CreditCard size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">{t("subscription.title")}</h2>
        </CardHeader>
        <CardBody>
          {hasSubscription && subscription ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Chip
                  size="sm"
                  color={subscription.status === "active" ? "success" : "warning"}
                  variant="flat"
                >
                  {subscription.status}
                </Chip>
                <span className="text-sm text-default-500">
                  {t("subscription.periodEnd", {
                    date: new Date(subscription.currentPeriodEnd).toLocaleDateString(),
                  })}
                </span>
              </div>
              {subscription.cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 p-3 bg-warning-50 rounded-lg text-warning-700 text-sm">
                  <AlertTriangle size={16} />
                  <span>{t("subscription.cancelWarning")}</span>
                </div>
              )}
              <Button
                variant="flat"
                startContent={<Settings size={16} />}
                onPress={handleManageSubscription}
              >
                {t("subscription.manage")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-default-500">{t("subscription.none")}</p>
              <div className="flex gap-2">
                <Button
                  as={Link}
                  href="/browse"
                  variant="flat"
                  color="primary"
                >
                  {t("subscription.browseCta")}
                </Button>
                {payments.length > 0 && (
                  <Button
                    variant="flat"
                    startContent={<ExternalLink size={16} />}
                    onPress={handleManageSubscription}
                  >
                    {t("subscription.portal")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Payment History Card */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CreditCard size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">{t("history.title")}</h2>
        </CardHeader>
        <CardBody>
          <Table
            aria-label="Payment history"
            removeWrapper
            bottomContent={
              pages > 1 ? (
                <div className="flex w-full justify-center">
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={page}
                    total={pages}
                    onChange={setPage}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>{t("history.date")}</TableColumn>
              <TableColumn>{t("history.description")}</TableColumn>
              <TableColumn>{t("history.type")}</TableColumn>
              <TableColumn>{t("history.amount")}</TableColumn>
              <TableColumn>{t("history.status")}</TableColumn>
              <TableColumn>{t("history.receipt")}</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : t("history.empty")}
              items={items}
            >
              {(item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(item.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm truncate max-w-[250px] block">
                      {item.description}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={item.type === "subscription" ? "secondary" : "primary"}
                    >
                      {item.type === "subscription"
                        ? t("history.typeSubscription")
                        : t("history.typeCredit")}
                    </Chip>
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatAmount(item.amountCents, item.currency)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={STATUS_COLOR[item.status] ?? "default"}
                    >
                      {item.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {item.receiptUrl ? (
                      <Link
                        href={item.receiptUrl}
                        isExternal
                        showAnchorIcon
                        anchorIcon={<ExternalLink size={12} />}
                        className="text-sm"
                      >
                        {t("history.view")}
                      </Link>
                    ) : (
                      <span className="text-default-300">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
