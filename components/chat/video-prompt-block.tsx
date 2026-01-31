"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Video, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface VideoPromptBlockProps {
  prompt: string;
}

/**
 * A styled block component that displays a video generation prompt
 * with a "Use Prompt" button to send it to the Video Generation Panel.
 */
export default function VideoPromptBlock({
  prompt,
}: VideoPromptBlockProps) {
  const t = useTranslations("chat");

  const handleUsePrompt = () => {
    // Dispatch a custom event that VideoGenerationPanel listens for
    window.dispatchEvent(
      new CustomEvent("use-video-prompt", { detail: { prompt } })
    );
  };

  return (
    <Card className="my-3 border border-primary/20 bg-primary/5 dark:bg-primary/10">
      <CardBody className="p-3 gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Video size={16} />
          <span className="text-xs font-medium uppercase tracking-wide">
            {t("videoPrompt")}
          </span>
        </div>
        <div className="text-sm text-foreground/90 whitespace-pre-wrap font-mono bg-background/50 rounded-md p-3 border border-divider">
          {prompt}
        </div>
        <Button
          size="sm"
          color="primary"
          variant="flat"
          className="self-end"
          endContent={<ArrowRight size={14} />}
          onPress={handleUsePrompt}
        >
          {t("usePrompt")}
        </Button>
      </CardBody>
    </Card>
  );
}
