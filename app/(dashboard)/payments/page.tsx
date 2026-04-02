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
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
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
  XCircle,
  RotateCcw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { STRIPE_ERROR_CODES, type StripeErrorCode } from "@/lib/stripe-errors";
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
  refunded: "danger",
  partially_refunded: "warning",
  open: "warning",
  void: "danger",
  draft: "default",
  uncollectible: "danger",
  unknown: "default",
};

export default function PaymentsPage() {
  const t = useTranslations("payments");
  const tHistory = useTranslations("payments.history");
  const tCredits = useTranslations("credits");
  const tStripeErrors = useTranslations("stripeErrors");
  const { user, loading: authLoading } = useAuth();
  const { hasSubscription, subscription, refresh: refreshSub } = useSubscription();

  const resolveStripeErrorCode = (err: unknown): StripeErrorCode => {
    const raw = err instanceof ApiError ? err.code : undefined;
    return raw && (STRIPE_ERROR_CODES as readonly string[]).includes(raw)
      ? (raw as StripeErrorCode)
      : "unknown";
  };

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
    } catch (err) {
      addToast({ title: tStripeErrors(resolveStripeErrorCode(err)), color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const pages = Math.ceil(payments.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return payments.slice(start, start + rowsPerPage);
  }, [page, payments]);

  const [canceling, setCanceling] = useState(false);
  const cancelModal = useDisclosure();
  const [resuming, setResuming] = useState(false);
  const resumeModal = useDisclosure();

  const handleManageSubscription = async () => {
    try {
      const { url } = await api.post("/api/stripe/portal");
      if (url) window.location.href = url;
    } catch (err) {
      addToast({ title: tStripeErrors(resolveStripeErrorCode(err)), color: "danger" });
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const data = await api.post("/api/stripe/cancel", {});
      if (data.success) {
        addToast({ title: t("subscription.cancelSuccess"), color: "success" });
        await new Promise((r) => setTimeout(r, 2000));
        await refreshSub();
        cancelModal.onClose();
      }
    } catch (err) {
      addToast({ title: tStripeErrors(resolveStripeErrorCode(err)), color: "danger" });
    } finally {
      setCanceling(false);
    }
  };

  const handleResumeSubscription = async () => {
    setResuming(true);
    try {
      const data = await api.post("/api/stripe/resume", {});
      if (data.success) {
        addToast({ title: t("subscription.resumeSuccess"), color: "success" });
        await new Promise((r) => setTimeout(r, 2000));
        await refreshSub();
        resumeModal.onClose();
      }
    } catch (err) {
      addToast({ title: tStripeErrors(resolveStripeErrorCode(err)), color: "danger" });
    } finally {
      setResuming(false);
    }
  };

  const STATUS_LABEL_KEY: Record<string, string> = {
    paid: "statusPaid",
    refunded: "statusRefunded",
    partially_refunded: "statusPartiallyRefunded",
    open: "statusOpen",
    void: "statusVoid",
    draft: "statusDraft",
    uncollectible: "statusUncollectible",
    unknown: "statusUnknown",
  };

  const formatStatus = (status: string) => {
    const key = STATUS_LABEL_KEY[status];
    return key ? tHistory(key) : status;
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
                  {t(subscription.cancelAtPeriodEnd
                    ? "subscription.endsOn"
                    : "subscription.periodEnd", {
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
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="flat"
                  startContent={<Settings size={16} />}
                  onPress={handleManageSubscription}
                >
                  {t("subscription.manage")}
                </Button>
                {subscription.cancelAtPeriodEnd ? (
                  <Button
                    variant="flat"
                    color="primary"
                    startContent={<RotateCcw size={16} />}
                    onPress={resumeModal.onOpen}
                  >
                    {t("subscription.resume")}
                  </Button>
                ) : (
                  <Button
                    variant="flat"
                    color="danger"
                    startContent={<XCircle size={16} />}
                    onPress={cancelModal.onOpen}
                  >
                    {t("subscription.cancel")}
                  </Button>
                )}
              </div>
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
                      {formatStatus(item.status)}
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

      {/* Cancel Subscription Confirmation Modal */}
      <Modal isOpen={cancelModal.isOpen} onOpenChange={cancelModal.onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-danger" />
                {t("subscription.cancelConfirmTitle")}
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  {t("subscription.cancelConfirmBody", {
                    date: subscription
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : "",
                  })}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={canceling}>
                  {t("subscription.cancelConfirmKeep")}
                </Button>
                <Button
                  color="danger"
                  isLoading={canceling}
                  onPress={handleCancelSubscription}
                >
                  {t("subscription.cancelConfirmProceed")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Resume Subscription Confirmation Modal */}
      <Modal isOpen={resumeModal.isOpen} onOpenChange={resumeModal.onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <RotateCcw size={20} className="text-primary" />
                {t("subscription.resumeConfirmTitle")}
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  {t("subscription.resumeConfirmBody", {
                    date: subscription
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : "",
                  })}
                </p>
                <p className="text-xs text-default-500">
                  {tCredits("paymentDisclosure")}{" "}
                  <a href="/legal/subscription-terms" className="underline hover:text-default-700">
                    {tCredits("subscriptionTerms")}
                  </a>
                  {" "}{tCredits("paymentDisclosureAnd")}{" "}
                  <a href="/legal/refunds" className="underline hover:text-default-700">
                    {tCredits("refundPolicy")}
                  </a>
                  .{" "}{tCredits("paymentDisclosureWithdrawal")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose} isDisabled={resuming}>
                  {t("subscription.resumeConfirmCancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={resuming}
                  onPress={handleResumeSubscription}
                >
                  {t("subscription.resumeConfirmProceed")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
