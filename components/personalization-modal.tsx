"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Progress } from "@heroui/progress";
import { Chip } from "@heroui/chip";
import { ArrowLeft, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PERSONALIZATION_QUESTIONS, type PersonalizationQuestion } from "@/lib/onboarding/personalization-questions";
import { useUpdateSettings } from "@/lib/user-settings";
import type { UserSettings } from "@/lib/user-settings/types";

interface PersonalizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PersonalizationModal = ({ isOpen, onClose }: PersonalizationModalProps) => {
  const t = useTranslations();
  const updateSettings = useUpdateSettings();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  const totalQuestions = PERSONALIZATION_QUESTIONS.length;
  const question = PERSONALIZATION_QUESTIONS[currentIndex];

  const currentAnswer = answers[question.id];

  const saveAnswer = useCallback(
    async (questionId: string, value: string | string[] | null) => {
      const patch: Partial<UserSettings> = {};
      (patch as Record<string, unknown>)[questionId] = value;
      try {
        await updateSettings(patch);
      } catch (err) {
        console.error("Failed to save personalization answer:", err);
      }
    },
    [updateSettings],
  );

  const handleOptionToggle = async (optionId: string, q: PersonalizationQuestion) => {
    if (q.type === "single") {
      const newVal = optionId;
      setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
      await saveAnswer(q.id, newVal);
      advanceToNext();
    } else {
      const current = (currentAnswer as string[]) || [];
      let updated: string[];
      if (current.includes(optionId)) {
        updated = current.filter((id) => id !== optionId);
      } else {
        updated = [...current, optionId];
      }
      setAnswers((prev) => ({ ...prev, [q.id]: updated }));
      await saveAnswer(q.id, updated.length > 0 ? updated : []);
    }
  };

  const handleCustomSubmit = async () => {
    const val = customInput.trim();
    if (!val) return;

    if (question.type === "single") {
      setAnswers((prev) => ({ ...prev, [question.id]: val }));
      await saveAnswer(question.id, val);
      setCustomInput("");
      setShowCustomInput(false);
      advanceToNext();
    } else {
      const current = (currentAnswer as string[]) || [];
      const updated = [...current, val];
      setAnswers((prev) => ({ ...prev, [question.id]: updated }));
      await saveAnswer(question.id, updated);
      setCustomInput("");
      setShowCustomInput(false);
    }
  };

  const advanceToNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
      setShowCustomInput(false);
      setCustomInput("");
    } else {
      finishPersonalization();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
      setShowCustomInput(false);
      setCustomInput("");
    }
  };

  const handleSkip = () => {
    advanceToNext();
  };

  const finishPersonalization = async () => {
    await saveAnswer("personalizationCompleted", true as unknown as string);
    onClose();
    setCurrentIndex(0);
    setAnswers({});
    setCustomInput("");
    setShowCustomInput(false);
  };

  const handleClose = () => {
    onClose();
    setCurrentIndex(0);
    setAnswers({});
    setCustomInput("");
    setShowCustomInput(false);
  };

  const isOptionSelected = (optionId: string) => {
    if (!currentAnswer) return false;
    if (question.type === "single") return currentAnswer === optionId;
    return (currentAnswer as string[]).includes(optionId);
  };

  const progressValue = ((currentIndex + 1) / totalQuestions) * 100;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      isDismissable={true}
      backdrop="blur"
      size="lg"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-2 pb-0">
              <div className="flex items-center gap-2">
                {currentIndex > 0 && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={handleBack}
                    aria-label={t("common.back")}
                  >
                    <ArrowLeft size={18} />
                  </Button>
                )}
                <span className="text-sm text-default-400">
                  {t("personalization.progress", {
                    current: currentIndex + 1,
                    total: totalQuestions,
                  })}
                </span>
              </div>
              <Progress
                value={progressValue}
                size="sm"
                color="primary"
                className="mt-1"
                aria-label={t("personalization.progressLabel")}
              />
            </ModalHeader>

            <ModalBody className="pt-4 pb-2 min-h-[320px]">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={question.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <h3 className="text-lg font-semibold mb-1">
                    {t(question.titleKey)}
                  </h3>
                  <p className="text-sm text-default-400 mb-4">
                    {t(question.subtitleKey)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {question.options.map((opt) => (
                      <Chip
                        key={opt.id}
                        variant={isOptionSelected(opt.id) ? "solid" : "bordered"}
                        color={isOptionSelected(opt.id) ? "primary" : "default"}
                        className="cursor-pointer select-none transition-all"
                        onClick={() => handleOptionToggle(opt.id, question)}
                      >
                        {t(opt.labelKey)}
                      </Chip>
                    ))}

                    {question.allowCustom && !showCustomInput && (
                      <Chip
                        variant="bordered"
                        color="default"
                        className="cursor-pointer select-none"
                        startContent={<Plus size={14} />}
                        onClick={() => setShowCustomInput(true)}
                      >
                        {t("personalization.somethingElse")}
                      </Chip>
                    )}
                  </div>

                  {showCustomInput && (
                    <div className="flex gap-2 mt-3">
                      <Input
                        size="sm"
                        placeholder={t("personalization.customPlaceholder")}
                        value={customInput}
                        onValueChange={setCustomInput}
                        variant="bordered"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCustomSubmit();
                        }}
                      />
                      <Button
                        size="sm"
                        color="primary"
                        onPress={handleCustomSubmit}
                        isDisabled={!customInput.trim()}
                      >
                        {t("common.confirm")}
                      </Button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </ModalBody>

            <ModalFooter className="flex justify-between">
              <Button
                variant="light"
                color="default"
                size="sm"
                onPress={handleSkip}
              >
                {t("personalization.skipForNow")}
              </Button>

              {question.type === "multi" && (
                <Button
                  color="primary"
                  size="sm"
                  onPress={advanceToNext}
                >
                  {currentIndex === totalQuestions - 1
                    ? t("common.finish")
                    : t("common.next")}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
