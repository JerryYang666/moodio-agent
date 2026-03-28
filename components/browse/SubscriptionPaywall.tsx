"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Lock, CheckCircle } from "lucide-react";
import { api } from "@/lib/api/client";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: string;
}

export default function SubscriptionPaywall() {
  const t = useTranslations("browse");
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

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
    setRedirecting(true);
    try {
      const { url } = await api.post("/api/stripe/checkout", {
        mode: "subscription",
      });
      if (url) {
        window.location.href = url;
      }
    } catch {
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

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-16 max-w-lg mx-auto text-center">
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

            <Button
              color="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={redirecting}
              onPress={handleSubscribe}
            >
              {t("paywall.subscribe")}
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
