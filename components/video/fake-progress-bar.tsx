"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { VideoGenerationStatus } from "@/components/video-provider";

const PROGRESS_DURATION_MS = 200000; // 200 seconds to reach 97%
const MAX_PROGRESS = 97;

interface FakeProgressBarProps {
  status: VideoGenerationStatus;
  createdAt: string;
  /** Additional CSS classes on the outer container */
  className?: string;
}

export default function FakeProgressBar({
  status,
  createdAt,
  className,
}: FakeProgressBarProps) {
  const [progress, setProgress] = useState(0);

  const initialProgress = useMemo(() => {
    if (status === "completed") return 100;
    if (status === "failed") return 0;

    const elapsed = Date.now() - new Date(createdAt).getTime();
    return Math.min((elapsed / PROGRESS_DURATION_MS) * MAX_PROGRESS, MAX_PROGRESS);
  }, [status, createdAt]);

  useEffect(() => {
    setProgress(initialProgress);

    if (status === "completed" || status === "failed") return;

    const interval = setInterval(() => {
      const totalElapsed = Date.now() - new Date(createdAt).getTime();
      setProgress(
        Math.min((totalElapsed / PROGRESS_DURATION_MS) * MAX_PROGRESS, MAX_PROGRESS)
      );
    }, 500);
    return () => clearInterval(interval);
  }, [status, createdAt, initialProgress]);

  if (status === "completed" || status === "failed") return null;

  return (
    <div className={className ?? "h-1 w-full bg-default-200 overflow-hidden"}>
      <motion.div
        className="h-full bg-primary"
        initial={{ width: `${initialProgress}%` }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}
