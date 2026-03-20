"use client";

import { useState, useCallback } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { cn } from "@heroui/theme";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

interface AskUserQuestion {
  id: string;
  question: string;
  options: string[];
}

interface AskUserCardProps {
  questions: AskUserQuestion[];
  onConfirm: (formattedAnswer: string) => void;
}

export default function AskUserCard({ questions, onConfirm }: AskUserCardProps) {
  const t = useTranslations();

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [customActive, setCustomActive] = useState<Record<string, boolean>>({});

  const selectOption = useCallback((qId: string, option: string) => {
    setSelections((prev) => ({ ...prev, [qId]: option }));
    setCustomActive((prev) => ({ ...prev, [qId]: false }));
  }, []);

  const activateCustom = useCallback((qId: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setCustomActive((prev) => ({ ...prev, [qId]: true }));
  }, []);

  const setCustomText = useCallback((qId: string, text: string) => {
    setCustomInputs((prev) => ({ ...prev, [qId]: text }));
  }, []);

  const allAnswered = questions.every(
    (q) => selections[q.id] || (customActive[q.id] && customInputs[q.id]?.trim())
  );

  const handleConfirm = useCallback(() => {
    const answers = questions.map((q) => {
      const answer = selections[q.id] || customInputs[q.id]?.trim() || "";
      return { question: q.question, answer };
    });

    let formatted: string;
    if (answers.length === 1) {
      formatted = answers[0].answer;
    } else {
      formatted = answers
        .map((a, i) => `${i + 1}. ${a.question}: ${a.answer}`)
        .join("\n");
    }

    onConfirm(formatted);
  }, [questions, selections, customInputs, onConfirm]);

  return (
    <Card className="w-full max-w-lg shadow-sm bg-default-100 dark:bg-default-50/10">
      <CardBody className="gap-4 px-4 py-3">
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{q.question}</p>
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={selections[q.id] === option ? "solid" : "flat"}
                  color={selections[q.id] === option ? "primary" : "default"}
                  className={cn(
                    "text-xs h-7",
                    selections[q.id] === option && "font-medium"
                  )}
                  onPress={() => selectOption(q.id, option)}
                >
                  {option}
                </Button>
              ))}
              <Button
                size="sm"
                variant={customActive[q.id] ? "solid" : "flat"}
                color={customActive[q.id] ? "primary" : "default"}
                className={cn(
                  "text-xs h-7",
                  customActive[q.id] && "font-medium"
                )}
                onPress={() => activateCustom(q.id)}
              >
                {t("chat.askUser.customOption")}
              </Button>
            </div>
            {customActive[q.id] && (
              <Input
                size="sm"
                placeholder={t("chat.askUser.customPlaceholder")}
                value={customInputs[q.id] || ""}
                onValueChange={(val) => setCustomText(q.id, val)}
                classNames={{ inputWrapper: "h-8" }}
                autoFocus
              />
            )}
          </div>
        ))}

        <Button
          size="sm"
          color="primary"
          className="self-end"
          isDisabled={!allAnswered}
          endContent={<Send size={14} />}
          onPress={handleConfirm}
        >
          {t("common.confirm")}
        </Button>
      </CardBody>
    </Card>
  );
}
