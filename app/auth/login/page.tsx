"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@heroui/input";
import { InputOtp } from "@heroui/input-otp";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { siteConfig } from "@/config/site";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
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
        throw new Error(data.error || "Failed to send OTP");
      }

      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
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
        throw new Error(data.error || "Failed to verify OTP");
      }

      // Hard redirect to home page to ensure cookies are properly loaded
      // Using window.location instead of router.push to force a full page reload
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OTP");
      setOtp("");
    } finally {
      setLoading(false);
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
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Welcome</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {step === "email"
                ? "Enter your email to receive a login code"
                : `Enter the ${OTP_LENGTH}-digit code sent to your email`}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestOTP} className="space-y-4">
              <Input
                type="email"
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                isRequired
                autoFocus
                size="lg"
              />

              <Button
                type="submit"
                color="primary"
                size="lg"
                className="w-full"
                isLoading={loading}
                isDisabled={!email || loading}
              >
                Send Login Code
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Code sent to: <strong>{email}</strong>
                </p>

                <InputOtp
                  length={OTP_LENGTH}
                  value={otp}
                  onValueChange={handleOTPChange}
                  isDisabled={loading}
                  errorMessage="Invalid OTP code"
                />

                {loading && (
                  <p className="text-sm text-gray-500">Verifying...</p>
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
                  Verify & Login
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
                  Use a different email
                </Button>

                <Button
                  color="default"
                  variant="light"
                  size="sm"
                  onPress={() => handleRequestOTP()}
                  isDisabled={loading}
                >
                  Resend code
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
