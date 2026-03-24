"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAcceptInvitationMutation } from "@/lib/redux/services/next-api";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { CheckCircle, XCircle } from "lucide-react";

export default function AcceptInvitePage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [acceptInvitation] = useAcceptInvitationMutation();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const token = searchParams.get("token");

  useEffect(() => {
    if (authLoading || !user) return;
    if (!token) {
      setStatus("error");
      setErrorMessage("Missing invitation token");
      return;
    }

    let cancelled = false;

    async function accept() {
      try {
        await acceptInvitation({ token: token! }).unwrap();
        if (cancelled) return;
        setStatus("success");
        setTimeout(() => router.push("/teams"), 2000);
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus("error");
        const message =
          err && typeof err === "object" && "data" in err
            ? (err as { data?: { error?: string } }).data?.error
            : undefined;
        setErrorMessage(message ?? "Failed to accept invitation");
      }
    }

    accept();
    return () => {
      cancelled = true;
    };
  }, [token, user, authLoading, acceptInvitation, router]);

  return (
    <div className="flex justify-center items-center min-h-[50vh] p-6">
      <Card className="max-w-md w-full">
        <CardBody className="flex flex-col items-center gap-4 py-12">
          {status === "loading" && (
            <>
              <Spinner size="lg" />
              <p className="text-default-500">{t("teams.accepting")}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="p-3 bg-success/20 rounded-full">
                <CheckCircle size={40} className="text-success" />
              </div>
              <p className="text-lg font-semibold">{t("teams.acceptSuccess")}</p>
              <p className="text-sm text-default-500">{t("teams.redirecting")}</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="p-3 bg-danger/20 rounded-full">
                <XCircle size={40} className="text-danger" />
              </div>
              <p className="text-lg font-semibold">{t("teams.acceptError")}</p>
              <p className="text-sm text-default-500">{errorMessage}</p>
              <Button color="primary" variant="flat" onPress={() => router.push("/teams")}>
                {t("teams.goToTeams")}
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
