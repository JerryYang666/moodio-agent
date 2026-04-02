"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Checkbox } from "@heroui/checkbox";
import { Chip } from "@heroui/chip";
import { addToast } from "@heroui/toast";
import { Bean, ShoppingCart, User, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { STRIPE_ERROR_CODES, type StripeErrorCode } from "@/lib/stripe-errors";
import { useSubscription } from "@/hooks/use-subscription";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
}

interface CreditPackageCardsProps {
  accountType: "personal" | "team";
  accountId: string;
  teamName?: string;
}

export default function CreditPackageCards({ accountType, accountId, teamName }: CreditPackageCardsProps) {
  const t = useTranslations("credits");
  const tLegal = useTranslations("legal");
  const tStripeErrors = useTranslations("stripeErrors");
  const { hasPaymentConsent } = useSubscription();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [agreedToPaymentTerms, setAgreedToPaymentTerms] = useState(false);

  const needsPaymentConsent = !hasPaymentConsent;

  useEffect(() => {
    api
      .get("/api/stripe/packages?type=credits")
      .then((data) => setPackages(data.creditPackages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBuy = async (packageId: string) => {
    setBuyingId(packageId);
    try {
      const { url } = await api.post("/api/stripe/checkout", {
        mode: "credits",
        packageId,
        accountType,
        accountId,
        ...(needsPaymentConsent && { agreedToPaymentTerms: true }),
      });
      if (url) window.location.href = url;
    } catch (err) {
      const raw = err instanceof ApiError ? err.code : undefined;
      const code: StripeErrorCode = raw && (STRIPE_ERROR_CODES as readonly string[]).includes(raw)
        ? (raw as StripeErrorCode)
        : "unknown";
      addToast({ title: tStripeErrors(code), color: "danger" });
      setBuyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  if (packages.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-0 pt-4 px-4 flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">{t("buyCredits")}</h2>
        </div>
        <Chip
          variant="flat"
          color={accountType === "team" ? "secondary" : "default"}
          size="sm"
          startContent={accountType === "team" ? <Users size={12} /> : <User size={12} />}
        >
          {accountType === "team"
            ? t("purchasingForTeam", { teamName: teamName ?? "" })
            : t("purchasingForPersonal")}
        </Chip>
      </CardHeader>
      <CardBody className="gap-4">
        {needsPaymentConsent && (
          <Checkbox
            isSelected={agreedToPaymentTerms}
            onValueChange={setAgreedToPaymentTerms}
            size="sm"
            className="items-start"
          >
            <span className="text-sm">
              {tLegal("agreePaymentPrefix")}{" "}
              <a href="/legal/subscription-terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {tLegal("subscriptionTerms")}
              </a>
              {", "}
              <a href="/legal/refunds" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {tLegal("refundPolicy")}
              </a>
              {", "}
              {tLegal("and")}{" "}
              <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {tLegal("privacyPolicy")}
              </a>
              .
            </span>
          </Checkbox>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card
              key={pkg.id}
              className="bg-linear-to-br from-secondary/10 to-secondary/5"
            >
              <CardBody className="py-5 gap-3 items-center text-center">
                <div className="flex items-center gap-1.5 text-primary">
                  <Bean size={20} />
                  <span className="text-2xl font-bold">
                    {pkg.credits.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm font-medium">{pkg.name}</p>
                <p className="text-xl font-bold">
                  ${(pkg.priceCents / 100).toFixed(2)}
                </p>
                <Button
                  color="primary"
                  variant="flat"
                  className="w-full mt-1"
                  isLoading={buyingId === pkg.id}
                  isDisabled={
                    (buyingId !== null && buyingId !== pkg.id) ||
                    (needsPaymentConsent && !agreedToPaymentTerms)
                  }
                  onPress={() => handleBuy(pkg.id)}
                >
                  {t("buyNow")}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
