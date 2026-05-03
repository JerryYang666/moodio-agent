"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Checkbox } from "@heroui/checkbox";
import { addToast } from "@heroui/toast";
import { Lock, CheckCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { STRIPE_ERROR_CODES, type StripeErrorCode } from "@/lib/stripe-errors";
import { useSubscription } from "@/hooks/use-subscription";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: string;
  trialPeriodDays: number;
}

export default function SubscriptionPaywall() {
  const t = useTranslations("browse");
  const tCredits = useTranslations("credits");
  const tLegal = useTranslations("legal");
  const tStripeErrors = useTranslations("stripeErrors");
  const { hasPaymentConsent } = useSubscription();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [agreedToPaymentTerms, setAgreedToPaymentTerms] = useState(false);
  const [consentError, setConsentError] = useState("");

  const needsPaymentConsent = !hasPaymentConsent;

  useEffect(() => {
    api
      .get("/api/stripe/packages?type=subscription")
      .then((data) => {
        setPlan(data.subscriptionPlans?.[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async () => {
    if (needsPaymentConsent && !agreedToPaymentTerms) {
      setConsentError(tLegal("mustAgreeToPaymentTerms"));
      return;
    }
    setConsentError("");
    setRedirecting(true);
    try {
      const { url } = await api.post("/api/stripe/checkout", {
        mode: "subscription",
        ...(needsPaymentConsent && { agreedToPaymentTerms: true }),
      });
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      const raw = err instanceof ApiError ? err.code : undefined;
      const code: StripeErrorCode = raw && (STRIPE_ERROR_CODES as readonly string[]).includes(raw)
        ? (raw as StripeErrorCode)
        : "unknown";
      addToast({ title: tStripeErrors(code), color: "danger" });
      setRedirecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const priceDisplay = plan
    ? `$${(plan.priceCents / 100).toFixed(2)}/${plan.interval === "year" ? "yr" : "mo"}`
    : null;
  const trialDays = plan?.trialPeriodDays ?? 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-full gap-6 px-4 py-16 max-w-lg mx-auto text-center">
      <div className="p-5 bg-primary/15 rounded-full">
        <Lock size={48} className="text-primary" />
      </div>

      <div>
        <h1 className="text-2xl font-bold mb-2">{t("paywall.title")}</h1>
        <p className="text-default-500">{t("paywall.description")}</p>
      </div>

      {plan && (
        <Card className="w-full bg-linear-to-br from-primary/10 to-primary/5">
          <CardBody className="py-6 gap-4">
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            {plan.description && (
              <p className="text-sm text-default-500">{plan.description}</p>
            )}
            {priceDisplay && (
              <p className="text-3xl font-bold text-primary">{priceDisplay}</p>
            )}

            {trialDays > 0 && (
              <div className="inline-flex mx-auto items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 text-success text-sm font-medium">
                {t("paywall.freeTrial", { days: trialDays })}
              </div>
            )}

            <ul className="text-sm text-default-600 space-y-1.5 text-left mx-auto">
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-success shrink-0" />
                {t("paywall.feature1")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-success shrink-0" />
                {t("paywall.feature2")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={14} className="text-success shrink-0" />
                {t("paywall.feature3")}
              </li>
            </ul>

            {needsPaymentConsent && (
              <div className="flex flex-col gap-1">
                <Checkbox
                  isSelected={agreedToPaymentTerms}
                  onValueChange={(v) => { setAgreedToPaymentTerms(v); setConsentError(""); }}
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
                {consentError && (
                  <p className="text-xs text-danger ml-7">{consentError}</p>
                )}
              </div>
            )}

            <p className="text-xs text-default-500 text-center">
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

            <Button
              color="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={redirecting}
              isDisabled={needsPaymentConsent && !agreedToPaymentTerms}
              onPress={handleSubscribe}
            >
              {trialDays > 0 ? t("paywall.startFreeTrial") : t("paywall.subscribe")}
            </Button>
          </CardBody>
        </Card>
      )}

      {!plan && (
        <p className="text-default-400">{t("paywall.noPlan")}</p>
      )}
    </div>
  );
}
