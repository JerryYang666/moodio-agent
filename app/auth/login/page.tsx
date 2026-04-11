"use client";

import { Card } from "@heroui/card";
import { LanguageSwitch } from "@/components/language-switch";
import { LegalFooter } from "@/components/legal-footer";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-8">
        <div className="relative">
          <div className="absolute right-0 top-0">
            <LanguageSwitch />
          </div>
        </div>
        <LoginForm />
      </Card>
      <LegalFooter className="mt-6 mb-4" />
    </div>
  );
}
