"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Users, MessageSquare, Settings, Activity, Video, Calculator, Bean } from "lucide-react";

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations("admin");

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">{t("unauthorized")}</div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* User Management Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/user-management")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Users className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("users.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("users.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("users.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/user-management")}
            >
              {t("users.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Chat Management Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/chat-management")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <MessageSquare className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("users.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("chats.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("chats.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/chat-management")}
            >
              {t("chats.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Telemetry/Events Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/events")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Activity className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("events.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("events.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("events.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/events")}
            >
              {t("events.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* System Management Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/system-management")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Settings className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("users.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("system.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("system.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/system-management")}
            >
              {t("system.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Fal Usage Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/fal-usage")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Activity className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("falUsage.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("falUsage.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("falUsage.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/fal-usage")}
            >
              {t("falUsage.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Video Generation History Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/video-management")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Video className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("videos.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("videos.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("videos.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/video-management")}
            >
              {t("videos.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Pricing Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/pricing")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Calculator className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("pricing.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("pricing.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("pricing.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/pricing")}
            >
              {t("pricing.goTo")}
            </Button>
          </CardFooter>
        </Card>

        {/* Credit Transactions Card */}
        <Card
          className="py-4 cursor-pointer hover:scale-[1.02] transition-transform"
          onPress={() => router.push("/admin/credit-transactions")}
        >
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Bean className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">
                {t("creditTransactions.subtitle")}
              </p>
              <h4 className="font-bold text-large">{t("creditTransactions.title")}</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">{t("creditTransactions.description")}</p>
          </CardBody>
          <CardFooter>
            <Button
              color="primary"
              variant="flat"
              onPress={() => router.push("/admin/credit-transactions")}
            >
              {t("creditTransactions.goTo")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
