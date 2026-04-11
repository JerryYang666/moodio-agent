"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@heroui/input";
import { InputOtp } from "@heroui/input-otp";
import { Button } from "@heroui/button";
import { Checkbox } from "@heroui/checkbox";
import { siteConfig } from "@/config/site";
import { startAuthentication } from "@simplewebauthn/browser";
import { Key, Lock, Eye, EyeOff } from "lucide-react";

interface LoginFormProps {
  onLoginSuccess?: () => void;
}

export function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const t = useTranslations();
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const OTP_LENGTH = siteConfig.auth.otp.length;

  const handleSuccess = () => {
    if (onLoginSuccess) {
      onLoginSuccess();
    } else {
      window.location.href = "/";
    }
  };

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

      setIsNewUser(data.isNewUser === true);
      setNeedsConsent(data.needsConsent === true);
      setAgreedToTerms(false);
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

    if (needsConsent && !agreedToTerms) {
      setError(t("legal.mustAgreeToTerms"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: otpCode,
          ...(needsConsent && { agreedToTerms: true }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("auth.failedToVerifyOtp"));
      }

      handleSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.failedToVerifyOtp"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password) return;

    if (needsConsent && !agreedToTerms) {
      setError(t("legal.mustAgreeToTerms"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(needsConsent && { agreedToTerms: true }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsConsent) {
          setNeedsConsent(true);
          setAgreedToTerms(false);
          setError(t("legal.mustAgreeToTerms"));
          return;
        }
        throw new Error(data.error || t("auth.invalidCredentials"));
      }

      handleSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.invalidCredentials")
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    setError("");

    try {
      const resp = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined }),
      });

      const options = await resp.json();
      if (options.error) throw new Error(options.error);

      let asseResp;
      try {
        asseResp = await startAuthentication(options);
      } catch (err) {
        if ((err as Error).name === "NotAllowedError") {
          throw new Error(t("auth.passkeyAuthCancelled"));
        }
        throw err;
      }

      const verifyResp = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asseResp),
      });

      const verification = await verifyResp.json();

      if (verification.verified) {
        handleSuccess();
      } else {
        throw new Error(verification.error || t("auth.verificationFailed"));
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : t("auth.passkeyLoginFailed")
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleOTPChange = (value: string) => {
    setOtp(value);
    if (value.length === OTP_LENGTH && (!needsConsent || agreedToTerms)) {
      setTimeout(() => handleVerifyOTP(value), 100);
    }
  };

  const consentCheckbox = (
    <div className="flex justify-center">
      <Checkbox
        isSelected={agreedToTerms}
        onValueChange={setAgreedToTerms}
        size="sm"
        className="items-start"
      >
        <span className="text-sm">
          {t("legal.agreePrefix")}{" "}
          <a
            href="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t("legal.termsOfService")}
          </a>
          {", "}
          <a
            href="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t("legal.privacyPolicy")}
          </a>
          {", "}
          {t("legal.and")}{" "}
          <a
            href="/legal/acceptable-use"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t("legal.acceptableUsePolicy")}
          </a>
          .
        </span>
      </Checkbox>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">{t("common.appName")}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {step === "email"
            ? t("auth.signInTitle")
            : step === "password"
              ? t("auth.signInWithPassword")
              : isNewUser
                ? t("auth.createAccountTitle")
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

          <Button
            type="button"
            color="default"
            variant="flat"
            size="lg"
            className="w-full"
            onPress={() => {
              if (!email) {
                setError(t("auth.emailRequired"));
                return;
              }
              setError("");
              setStep("password");
            }}
            isDisabled={loading || passkeyLoading}
            startContent={<Lock size={20} />}
          >
            {t("auth.signInWithPassword")}
          </Button>

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
      ) : step === "password" ? (
        <div className="space-y-4">
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <Input
              type="email"
              label={t("auth.emailLabel")}
              value={email}
              isReadOnly
              size="lg"
              variant="bordered"
            />

            <Input
              type={showPassword ? "text" : "password"}
              label={t("auth.password")}
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              isRequired
              size="lg"
              isDisabled={loading}
              autoFocus
              endContent={
                <button
                  type="button"
                  className="focus:outline-none"
                  onMouseDown={() => setShowPassword(true)}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                >
                  {showPassword ? (
                    <EyeOff size={20} className="text-default-400" />
                  ) : (
                    <Eye size={20} className="text-default-400" />
                  )}
                </button>
              }
            />

            <Button
              type="submit"
              color="primary"
              size="lg"
              className="w-full"
              isLoading={loading}
              isDisabled={!password || loading || (needsConsent && !agreedToTerms)}
            >
              {t("auth.signInWithPassword")}
            </Button>
          </form>

          {needsConsent && consentCheckbox}

          <Button
            color="default"
            variant="light"
            size="sm"
            className="w-full"
            onPress={() => {
              setStep("email");
              setPassword("");
              setError("");
            }}
            isDisabled={loading}
          >
            {t("auth.backToOtp")}
          </Button>
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

          {needsConsent && consentCheckbox}

          <div className="flex flex-col space-y-2 mt-4">
            <Button
              color="primary"
              size="lg"
              className="w-full"
              onPress={() => handleVerifyOTP()}
              isLoading={loading}
              isDisabled={
                otp.length !== OTP_LENGTH ||
                loading ||
                (needsConsent && !agreedToTerms)
              }
            >
              {isNewUser
                ? t("auth.createAndVerify")
                : t("auth.verifyAndLogin")}
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
  );
}
