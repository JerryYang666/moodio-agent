"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";
import { startRegistration } from "@simplewebauthn/browser";
import { Key, Check, Sparkles } from "lucide-react";
import { addToast } from "@heroui/toast";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { PersonalizationModal } from "@/components/personalization-modal";

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

const BIRTH_YEAR_MIN = 1930;
const BIRTH_YEAR_MAX = new Date().getFullYear() - 10;

export const OnboardingModal = () => {
  const t = useTranslations();
  const { user, refreshUser } = useAuth();
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [languagePreference, setLanguagePreference] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [showPersonalization, setShowPersonalization] = useState(false);

  useEffect(() => {
    if (user && user.roles.includes("new_user")) {
      onOpen();
      setStep(1);
      setPasskeyAdded(false);
      setName("");
      setBirthYear("");
      setLanguagePreference("");
    }
  }, [user, onOpen]);

  const handleFinalize = async (openPersonalization: boolean) => {
    setLoading(true);
    try {
      const trimmedName = name.trim();
      const nameParts = trimmedName.split(" ");
      const firstName = trimmedName ? nameParts[0] : undefined;
      const lastName =
        trimmedName && nameParts.length > 1
          ? nameParts.slice(1).join(" ")
          : undefined;

      const parsedBirthYear = birthYear ? parseInt(birthYear, 10) : undefined;

      await api.post("/api/auth/onboarding", {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        birthYear:
          parsedBirthYear && parsedBirthYear >= BIRTH_YEAR_MIN && parsedBirthYear <= BIRTH_YEAR_MAX
            ? parsedBirthYear
            : undefined,
        languagePreference: languagePreference || undefined,
      });
      await refreshUser();
      onClose();

      if (openPersonalization) {
        setShowPersonalization(true);
      }
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      addToast({ title: t("onboarding.failedToCompleteOnboarding"), color: "danger" });
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
        setPasskeyAdded(true);
        addToast({ title: t("onboarding.passkeyAddedSuccess"), color: "success" });
      } else {
        throw new Error(verification.error || t("auth.verificationFailed"));
      }
    } catch (error) {
      console.error(error);
      addToast({
        title: error instanceof Error ? error.message : t("onboarding.failedToAddPasskey"),
        color: "danger",
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const getTitle = () => {
    switch (step) {
      case 1:
        return t("onboarding.welcomeTitle");
      case 2:
        return t("onboarding.birthYearTitle");
      case 3:
        return t("onboarding.languageTitle");
      case 4:
        return t("onboarding.enhanceSecurityTitle");
      case 5:
        return t("onboarding.personalizeTitle");
      default:
        return "";
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable={false}
        hideCloseButton={true}
        backdrop="blur"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {getTitle()}
              </ModalHeader>
              <ModalBody>
                {step === 1 && (
                  <>
                    <p className="text-default-500 text-sm mb-2">
                      {t("onboarding.whatToCallYou")}
                    </p>
                    <div className="flex flex-col gap-4">
                      <Input
                        placeholder={t("onboarding.yourName")}
                        value={name}
                        onValueChange={setName}
                        variant="bordered"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && name.trim()) {
                            setStep(2);
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <p className="text-default-500 text-sm mb-2">
                      {t("onboarding.birthYearDescription")}
                    </p>
                    <div className="flex flex-col gap-4">
                      <Input
                        type="number"
                        placeholder={t("onboarding.birthYearPlaceholder")}
                        value={birthYear}
                        onValueChange={setBirthYear}
                        variant="bordered"
                        autoFocus
                        min={BIRTH_YEAR_MIN}
                        max={BIRTH_YEAR_MAX}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setStep(3);
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="text-default-500 text-sm mb-2">
                      {t("onboarding.languageDescription")}
                    </p>
                    <div className="flex flex-col gap-4">
                      <Select
                        label={t("onboarding.languageSelectLabel")}
                        selectedKeys={languagePreference ? [languagePreference] : []}
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;
                          setLanguagePreference(selected || "");
                        }}
                        variant="bordered"
                      >
                        {ALL_LANGUAGE_OPTIONS.map((lang) => (
                          <SelectItem key={lang.code}>{lang.name}</SelectItem>
                        ))}
                      </Select>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <p className="text-default-500 text-sm mb-2">
                      {t("onboarding.passkeyDescription")}
                    </p>
                    <div className="flex flex-col gap-4 items-center py-4">
                      {passkeyAdded ? (
                        <div className="flex flex-col items-center gap-2 text-success">
                          <div className="p-3 rounded-full bg-success/10">
                            <Check size={32} />
                          </div>
                          <p className="font-medium">{t("onboarding.passkeyAddedTitle")}</p>
                        </div>
                      ) : (
                        <Button
                          size="lg"
                          color="primary"
                          variant="flat"
                          className="w-full max-w-xs"
                          onPress={handleAddPasskey}
                          isLoading={passkeyLoading}
                          startContent={<Key />}
                        >
                          {t("onboarding.addPasskey")}
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {step === 5 && (
                  <>
                    <div className="flex flex-col items-center gap-4 py-4">
                      <div className="p-4 rounded-full bg-primary/10">
                        <Sparkles size={40} className="text-primary" />
                      </div>
                      <p className="text-default-500 text-sm text-center">
                        {t("onboarding.personalizeDescription")}
                      </p>
                    </div>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                {step === 1 && (
                  <>
                    <Button
                      color="danger"
                      variant="light"
                      onPress={() => {
                        setName("");
                        setStep(2);
                      }}
                    >
                      {t("common.skip")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => setStep(2)}
                      isDisabled={!name.trim()}
                    >
                      {t("common.next")}
                    </Button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Button
                      color="danger"
                      variant="light"
                      onPress={() => {
                        setBirthYear("");
                        setStep(3);
                      }}
                    >
                      {t("common.skip")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => setStep(3)}
                    >
                      {t("common.next")}
                    </Button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Button
                      color="danger"
                      variant="light"
                      onPress={() => {
                        setLanguagePreference("");
                        setStep(4);
                      }}
                    >
                      {t("common.skip")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => setStep(4)}
                    >
                      {t("common.next")}
                    </Button>
                  </>
                )}

                {step === 4 && (
                  <>
                    <Button
                      color="default"
                      variant="light"
                      onPress={() => setStep(5)}
                      isDisabled={loading}
                    >
                      {t("common.skip")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => setStep(5)}
                      isLoading={loading}
                    >
                      {t("common.next")}
                    </Button>
                  </>
                )}

                {step === 5 && (
                  <>
                    <Button
                      color="default"
                      variant="light"
                      onPress={() => handleFinalize(false)}
                      isDisabled={loading}
                    >
                      {t("onboarding.noThanks")}
                    </Button>
                    <Button
                      color="primary"
                      onPress={() => handleFinalize(true)}
                      isLoading={loading}
                    >
                      {t("onboarding.letsDoIt")}
                    </Button>
                  </>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <PersonalizationModal
        isOpen={showPersonalization}
        onClose={() => setShowPersonalization(false)}
      />
    </>
  );
};
