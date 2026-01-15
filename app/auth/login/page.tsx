"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@heroui/input";
import { InputOtp } from "@heroui/input-otp";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { siteConfig } from "@/config/site";
import { startAuthentication } from "@simplewebauthn/browser";
import { Key } from "lucide-react";
import { LanguageSwitch } from "@/components/language-switch";

export default function LoginPage() {
  const t = useTranslations();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState("");

  const OTP_LENGTH = siteConfig.auth.otp.length;

  const handleRequestOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("auth.failedToSendOtp"));
      }

      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.failedToSendOtp"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (code?: string) => {
    const otpCode = code || otp;
    if (otpCode.length !== OTP_LENGTH) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("auth.failedToVerifyOtp"));
      }

      // Hard redirect to home page to ensure cookies are properly loaded
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.failedToVerifyOtp"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    setError("");

    try {
      // 1. Get options
      const resp = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      });

      const options = await resp.json();
      if (options.error) throw new Error(options.error);

      // 2. Start authentication
      let asseResp;
      try {
        asseResp = await startAuthentication(options);
      } catch (err) {
        if ((err as Error).name === "NotAllowedError") {
          throw new Error(t("auth.passkeyAuthCancelled"));
        }
        throw err;
      }

      // 3. Verify
      const verifyResp = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asseResp),
      });

      const verification = await verifyResp.json();

      if (verification.verified) {
        window.location.href = "/";
      } else {
        throw new Error(verification.error || t("auth.verificationFailed"));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("auth.passkeyLoginFailed"));
    } finally {
      setPasskeyLoading(false);
    }
  };

  // Auto-submit when OTP is complete
  const handleOTPChange = (value: string) => {
    setOtp(value);
    if (value.length === OTP_LENGTH) {
      setTimeout(() => handleVerifyOTP(value), 100);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-8">
        <div className="space-y-6">
          <div className="text-center relative">
            <div className="absolute right-0 top-0">
              <LanguageSwitch />
            </div>
            <h1 className="text-3xl font-bold mb-2">{t("common.appName")}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {step === "email"
                ? t("auth.signInTitle")
                : t("auth.enterOtpCode", { count: OTP_LENGTH })}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === "email" ? (
            <div className="space-y-4">
              <form onSubmit={handleRequestOTP} className="space-y-4">
                <Input
                  type="email"
                  label={t("auth.emailLabel")}
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  isRequired
                  size="lg"
                  isDisabled={loading || passkeyLoading}
                />

                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className="w-full"
                  isLoading={loading}
                  isDisabled={!email || loading || passkeyLoading}
                >
                  {t("auth.sendLoginCode")}
                </Button>
              </form>

              <div className="relative flex py-2 items-center">
                <div className="grow border-t border-default-200"></div>
              </div>

              <Button
                type="button"
                color="secondary"
                variant="flat"
                size="lg"
                className="w-full"
                onPress={handlePasskeyLogin}
                isLoading={passkeyLoading}
                isDisabled={loading}
                startContent={<Key size={20} />}
              >
                {t("auth.signInWithPasskey")}
              </Button>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                {t("auth.newUserHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("auth.codeSentTo")} <strong>{email}</strong>
                </p>

                <InputOtp
                  length={OTP_LENGTH}
                  value={otp}
                  onValueChange={handleOTPChange}
                  isDisabled={loading}
                  errorMessage={t("auth.invalidOtpCode")}
                />

                {loading && (
                  <p className="text-sm text-gray-500">{t("auth.verifying")}</p>
                )}
              </div>

              <div className="flex flex-col space-y-2">
                <Button
                  color="primary"
                  size="lg"
                  className="w-full"
                  onPress={() => handleVerifyOTP()}
                  isLoading={loading}
                  isDisabled={otp.length !== OTP_LENGTH || loading}
                >
                  {t("auth.verifyAndLogin")}
                </Button>

                <Button
                  color="default"
                  variant="light"
                  size="sm"
                  onPress={() => {
                    setStep("email");
                    setOtp("");
                    setError("");
                  }}
                  isDisabled={loading}
                >
                  {t("auth.useDifferentEmail")}
                </Button>

                <Button
                  color="default"
                  variant="light"
                  size="sm"
                  onPress={() => handleRequestOTP()}
                  isDisabled={loading}
                >
                  {t("auth.resendCode")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
