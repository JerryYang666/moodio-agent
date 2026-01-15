"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { startRegistration } from "@simplewebauthn/browser";
import { Key } from "lucide-react";
import { addToast } from "@heroui/toast";

export default function ProfilePage() {
  const t = useTranslations();
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      fetchPasskeys();
    }
  }, [user]);

  const fetchPasskeys = async () => {
    try {
      const res = await fetch("/api/users/passkeys");
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys);
      }
    } catch (error) {
      console.error("Failed to fetch passkeys", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });

      if (res.ok) {
        addToast({ title: t("profile.profileUpdated"), color: "success" });
        refreshUser();
      } else {
        addToast({ title: t("profile.failedToUpdateProfile"), color: "danger" });
      }
    } catch (error) {
      addToast({ title: t("common.error"), color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setPasskeyLoading(true);
    try {
      // 1. Get options
      const resp = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      const options = await resp.json();

      if (options.error) throw new Error(options.error);

      // 2. Start registration
      const attResp = await startRegistration(options);

      // 3. Verify
      const verifyResp = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });

      const verification = await verifyResp.json();

      if (verification.verified) {
        addToast({ title: t("onboarding.passkeyAddedSuccess"), color: "success" });
        fetchPasskeys();
      } else {
        throw new Error(verification.error || t("auth.verificationFailed"));
      }
    } catch (error) {
      console.error(error);
      addToast({
        title: error instanceof Error ? error.message : t("onboarding.failedToAddPasskey"),
        color: "danger"
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">{t("profile.title")}</h1>
        <p className="text-default-500">{t("profile.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">{t("profile.personalInfo")}</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t("profile.firstName")}
                value={firstName}
                onValueChange={setFirstName}
                variant="bordered"
              />
              <Input
                label={t("profile.lastName")}
                value={lastName}
                onValueChange={setLastName}
                variant="bordered"
              />
            </div>
            <div className="flex justify-end items-center">
              <Button color="primary" type="submit" isLoading={loading}>
                {t("profile.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">{t("profile.security")}</h2>
          <p className="text-small text-default-500">{t("profile.managePasskeys")}</p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("profile.passkeys")}</span>
            </div>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={handleAddPasskey}
              isLoading={passkeyLoading}
            >
              {t("onboarding.addPasskey")}
            </Button>
          </div>

          <div className="space-y-2">
            {passkeys.length === 0 ? (
              <p className="text-sm text-default-400 italic">{t("profile.noPasskeysYet")}</p>
            ) : (
              passkeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between p-3 rounded-lg bg-default-50 border border-default-100">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{t("profile.passkeyDevice", { deviceType: pk.deviceType })}</span>
                    <span className="text-xs text-default-400">{t("profile.addedOn", { date: new Date(pk.createdAt).toLocaleDateString() })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
