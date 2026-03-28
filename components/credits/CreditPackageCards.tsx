"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Bean, ShoppingCart } from "lucide-react";
import { api } from "@/lib/api/client";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
}

export default function CreditPackageCards() {
  const t = useTranslations("credits");
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

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
      });
      if (url) window.location.href = url;
    } catch {
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
      <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">{t("buyCredits")}</h2>
        </div>
      </CardHeader>
      <CardBody>
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
                  isDisabled={buyingId !== null && buyingId !== pkg.id}
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
