"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@heroui/button";
import { Undo2, Send } from "lucide-react";
import { useTranslations } from "next-intl";

interface UndoSendOverlayProps {
  isVisible: boolean;
  duration?: number; // Duration in milliseconds
  onUndo: () => void;
  onComplete: () => void;
}

export default function UndoSendOverlay({
  isVisible,
  duration = 3000,
  onUndo,
  onComplete,
}: UndoSendOverlayProps) {
  const t = useTranslations("video");
  const [progress, setProgress] = useState(0);

  // Reset progress when visibility changes
  useEffect(() => {
    if (isVisible) {
      setProgress(0);
    }
  }, [isVisible]);

  // Animate progress and trigger completion
  useEffect(() => {
    if (!isVisible) return;

    const startTime = Date.now();
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      setProgress(newProgress);

      if (elapsed >= duration) {
        clearInterval(intervalId);
        onComplete();
      }
    }, 16); // ~60fps

    return () => clearInterval(intervalId);
  }, [isVisible, duration, onComplete]);

  const handleUndo = useCallback(() => {
    onUndo();
  }, [onUndo]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm rounded-lg"
        >
          <div className="flex flex-col items-center gap-4 p-6">
            {/* Animated send icon with circular progress */}
            <div className="relative">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-default-200"
                />
                {/* Progress circle */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="text-primary"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                />
              </svg>
              {/* Send icon in center */}
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Send size={28} className="text-primary" />
              </motion.div>
            </div>

            {/* Text */}
            <motion.p
              className="text-sm sm:text-base font-medium text-center text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {t("sendingRequest")}
            </motion.p>

            {/* Undo button */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
            >
              <Button
                color="default"
                variant="bordered"
                size="lg"
                startContent={<Undo2 size={18} />}
                onPress={handleUndo}
                className="font-medium"
              >
                {t("undo")}
              </Button>
            </motion.div>

            {/* Time remaining indicator */}
            <motion.p
              className="text-xs text-default-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {Math.ceil((duration - (progress / 100) * duration) / 1000)}s
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
