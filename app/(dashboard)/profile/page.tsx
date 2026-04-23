"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@heroui/input";
import { InputOtp } from "@heroui/input-otp";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { startRegistration } from "@simplewebauthn/browser";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import { Chip } from "@heroui/chip";
import { Key, Lock, Eye, EyeOff, Globe, Sparkles, Rows2 } from "lucide-react";
import { addToast } from "@heroui/toast";
import { siteConfig } from "@/config/site";
import { LegalFooter } from "@/components/legal-footer";
import { useUserSetting, useUpdateSettings } from "@/lib/user-settings";
import { PERSONALIZATION_QUESTIONS } from "@/lib/onboarding/personalization-questions";
import { locales, localeNames, type Locale } from "@/i18n/config";

export default function ProfilePage() {
  const t = useTranslations();
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  // Password change state
  const [passwordStep, setPasswordStep] = useState<
    "idle" | "otp_sent" | "submitting"
  >("idle");
  const [passwordOtp, setPasswordOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const cnMode = useUserSetting("cnMode");
  const languagePreference = useUserSetting("languagePreference");
  const creativeGoals = useUserSetting("creativeGoals");
  const userRole = useUserSetting("userRole");
  const experienceLevel = useUserSetting("experienceLevel");
  const mainGoal = useUserSetting("mainGoal");
  const communicationTone = useUserSetting("communicationTone");
  const explanationDepth = useUserSetting("explanationDepth");
  const stackChatInputButtons = useUserSetting("stackChatInputButtons");
  const updateSettings = useUpdateSettings();

  const AGENT_ONLY_LANGUAGES: { code: string; name: string }[] = [
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "pt", name: "Português" },
    { code: "ru", name: "Русский" },
    { code: "ar", name: "العربية" },
    { code: "hi", name: "हिन्दी" },
    { code: "th", name: "ภาษาไทย" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "id", name: "Bahasa Indonesia" },
  ];

  const ALL_LANGUAGE_OPTIONS = [
    ...locales.map((l) => ({ code: l, name: localeNames[l] })),
    ...AGENT_ONLY_LANGUAGES,
  ];

  const OTP_LENGTH = siteConfig.auth.otp.length;

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
      const resp = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
      });
      const options = await resp.json();

      if (options.error) throw new Error(options.error);

      const attResp = await startRegistration(options);

      const verifyResp = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });

      const verification = await verifyResp.json();

      if (verification.verified) {
        addToast({
          title: t("onboarding.passkeyAddedSuccess"),
          color: "success",
        });
        fetchPasskeys();
      } else {
        throw new Error(verification.error || t("auth.verificationFailed"));
      }
    } catch (error) {
      console.error(error);
      addToast({
        title:
          error instanceof Error
            ? error.message
            : t("onboarding.failedToAddPasskey"),
        color: "danger",
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleRequestPasswordOTP = async () => {
    setPasswordLoading(true);
    setPasswordError("");

    try {
      const res = await fetch("/api/auth/password/request-otp", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("common.error"));
      }

      setPasswordStep("otp_sent");
      addToast({
        title: t("profile.otpSentForPassword"),
        color: "success",
      });
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : t("common.error")
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError(t("profile.passwordMismatch"));
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t("profile.passwordTooWeak"));
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await fetch("/api/auth/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: passwordOtp, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("common.error"));
      }

      addToast({
        title: user?.hasPassword
          ? t("profile.passwordChanged")
          : t("profile.passwordSetSuccess"),
        color: "success",
      });

      // Reset state
      setPasswordStep("idle");
      setPasswordOtp("");
      setNewPassword("");
      setConfirmPassword("");
      refreshUser();
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : t("common.error")
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const resetPasswordFlow = () => {
    setPasswordStep("idle");
    setPasswordOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
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
          <h2 className="text-lg font-semibold">{t("profile.accountSettings")}</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary" />
              <div className="flex flex-col">
                <span className="font-medium">{t("profile.cnMode")}</span>
                <span className="text-xs text-default-400">
                  {t("profile.cnModeDescription")}
                </span>
              </div>
            </div>
            <Switch
              isSelected={cnMode}
              onValueChange={(val) => updateSettings({ cnMode: val })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Rows2 className="w-5 h-5 text-primary" />
              <div className="flex flex-col">
                <span className="font-medium">{t("profile.stackChatInputButtons")}</span>
                <span className="text-xs text-default-400">
                  {t("profile.stackChatInputButtonsDescription")}
                </span>
              </div>
            </div>
            <Switch
              isSelected={stackChatInputButtons}
              onValueChange={(val) => updateSettings({ stackChatInputButtons: val })}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t("profile.personalization")}</h2>
          </div>
          <p className="text-small text-default-500">
            {t("profile.personalizationDescription")}
          </p>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("profile.languagePreferenceLabel")}</span>
            <Select
              selectedKeys={languagePreference ? [languagePreference] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                updateSettings({ languagePreference: selected || null });
              }}
              variant="bordered"
              size="sm"
              placeholder={t("profile.selectLanguage")}
            >
              {ALL_LANGUAGE_OPTIONS.map((lang) => (
                <SelectItem key={lang.code}>{lang.name}</SelectItem>
              ))}
            </Select>
          </div>

          {PERSONALIZATION_QUESTIONS.map((q) => {
            const currentValue = (() => {
              switch (q.id) {
                case "creativeGoals": return creativeGoals;
                case "userRole": return userRole;
                case "experienceLevel": return experienceLevel;
                case "mainGoal": return mainGoal;
                case "communicationTone": return communicationTone;
                case "explanationDepth": return explanationDepth;
                default: return null;
              }
            })();

            if (q.type === "multi") {
              const values = (currentValue as string[]) || [];
              return (
                <div key={q.id} className="space-y-2">
                  <span className="text-sm font-medium">{t(q.titleKey)}</span>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <Chip
                        key={opt.id}
                        variant={values.includes(opt.id) ? "solid" : "bordered"}
                        color={values.includes(opt.id) ? "primary" : "default"}
                        className="cursor-pointer select-none transition-all"
                        onClick={() => {
                          const updated = values.includes(opt.id)
                            ? values.filter((v) => v !== opt.id)
                            : [...values, opt.id];
                          updateSettings({ [q.id]: updated });
                        }}
                      >
                        {t(opt.labelKey)}
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={q.id} className="space-y-2">
                <span className="text-sm font-medium">{t(q.titleKey)}</span>
                <Select
                  selectedKeys={(currentValue as string) ? [currentValue as string] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as string;
                    updateSettings({ [q.id]: selected || null });
                  }}
                  variant="bordered"
                  size="sm"
                >
                  {q.options.map((opt) => (
                    <SelectItem key={opt.id}>{t(opt.labelKey)}</SelectItem>
                  ))}
                </Select>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">{t("profile.security")}</h2>
          <p className="text-small text-default-500">
            {t("profile.managePasskeys")}
          </p>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* Passkeys section */}
          <div className="space-y-4">
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
                <p className="text-sm text-default-400 italic">
                  {t("profile.noPasskeysYet")}
                </p>
              ) : (
                passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-default-50 border border-default-100"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {t("profile.passkeyDevice", {
                          deviceType: pk.deviceType,
                        })}
                      </span>
                      <span className="text-xs text-default-400">
                        {t("profile.addedOn", {
                          date: new Date(pk.createdAt).toLocaleDateString(),
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-default-100" />

          {/* Password section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                <div className="flex flex-col">
                  <span className="font-medium">{t("profile.password")}</span>
                  <span className="text-xs text-default-400">
                    {user?.hasPassword
                      ? t("profile.passwordIsSet")
                      : t("profile.noPasswordSet")}
                  </span>
                </div>
              </div>
              {passwordStep === "idle" && (
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={handleRequestPasswordOTP}
                  isLoading={passwordLoading}
                >
                  {user?.hasPassword
                    ? t("profile.changePassword")
                    : t("profile.setPassword")}
                </Button>
              )}
            </div>

            {passwordStep === "otp_sent" && (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <p className="text-sm text-default-500">
                  {t("profile.enterOtpAndNewPassword")}
                </p>

                {passwordError && (
                  <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                    {passwordError}
                  </div>
                )}

                <div className="flex flex-col items-center">
                  <InputOtp
                    length={OTP_LENGTH}
                    value={passwordOtp}
                    onValueChange={setPasswordOtp}
                    isDisabled={passwordLoading}
                  />
                </div>

                <Input
                  type={showNewPassword ? "text" : "password"}
                  label={t("profile.newPassword")}
                  value={newPassword}
                  onValueChange={setNewPassword}
                  variant="bordered"
                  isDisabled={passwordLoading}
                  endContent={
                    <button
                      type="button"
                      className="focus:outline-none"
                      onMouseDown={() => setShowNewPassword(true)}
                      onMouseUp={() => setShowNewPassword(false)}
                      onMouseLeave={() => setShowNewPassword(false)}
                      onTouchStart={() => setShowNewPassword(true)}
                      onTouchEnd={() => setShowNewPassword(false)}
                    >
                      {showNewPassword ? (
                        <EyeOff size={18} className="text-default-400" />
                      ) : (
                        <Eye size={18} className="text-default-400" />
                      )}
                    </button>
                  }
                />

                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  label={t("profile.confirmPassword")}
                  value={confirmPassword}
                  onValueChange={setConfirmPassword}
                  variant="bordered"
                  isDisabled={passwordLoading}
                  endContent={
                    <button
                      type="button"
                      className="focus:outline-none"
                      onMouseDown={() => setShowConfirmPassword(true)}
                      onMouseUp={() => setShowConfirmPassword(false)}
                      onMouseLeave={() => setShowConfirmPassword(false)}
                      onTouchStart={() => setShowConfirmPassword(true)}
                      onTouchEnd={() => setShowConfirmPassword(false)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} className="text-default-400" />
                      ) : (
                        <Eye size={18} className="text-default-400" />
                      )}
                    </button>
                  }
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={resetPasswordFlow}
                    isDisabled={passwordLoading}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    type="submit"
                    isLoading={passwordLoading}
                    isDisabled={
                      passwordOtp.length !== OTP_LENGTH ||
                      !newPassword ||
                      !confirmPassword
                    }
                  >
                    {user?.hasPassword
                      ? t("profile.changePassword")
                      : t("profile.setPassword")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardBody>
      </Card>

      <LegalFooter className="pt-8" />
    </div>
  );
}
