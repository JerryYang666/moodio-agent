"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  useContext,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePathname, useRouter } from "next/navigation";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";
import { getUserFriendlyErrorKey } from "@/lib/video/error-classify";

interface VideoGeneration {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error?: string | null;
}

interface VideoContextType {
  monitoredGenerations: string[];
  monitorGeneration: (generationId: string) => void;
  cancelMonitorGeneration: (generationId: string) => void;
  isGenerationMonitored: (generationId: string) => boolean;
}

export const VideoContext = createContext<VideoContextType | undefined>(
  undefined
);

export function useVideo() {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error("useVideo must be used within a VideoProvider");
  }
  return context;
}

const POLL_INTERVAL = 5000; // 5 seconds

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("video");

  // Set of generation IDs being monitored (with their initial status)
  const [monitoredGenerations, setMonitoredGenerations] = useState<
    Record<string, "pending" | "processing">
  >({});
  const monitoredRef = useRef<Record<string, "pending" | "processing">>({});

  // Keep ref in sync
  useEffect(() => {
    monitoredRef.current = monitoredGenerations;
  }, [monitoredGenerations]);

  const monitorGeneration = useCallback((generationId: string) => {
    // Only monitor if we have notification permission or might get it
    try {
      if ("Notification" in window && Notification.permission === "denied") {
        return;
      }
    } catch (e) {
      console.warn("Error checking notification permission:", e);
    }

    setMonitoredGenerations((prev) => ({
      ...prev,
      [generationId]: "processing",
    }));
  }, []);

  const cancelMonitorGeneration = useCallback((generationId: string) => {
    setMonitoredGenerations((prev) => {
      const newState = { ...prev };
      delete newState[generationId];
      return newState;
    });
  }, []);

  const isGenerationMonitored = useCallback(
    (generationId: string) => {
      return !!monitoredGenerations[generationId];
    },
    [monitoredGenerations]
  );

  // Polling for monitored video generations
  useEffect(() => {
    if (!user) return;

    const pollInterval = setInterval(async () => {
      const currentMonitored = monitoredRef.current;
      const generationIds = Object.keys(currentMonitored);

      if (generationIds.length === 0) return;

      for (const generationId of generationIds) {
        try {
          const res = await fetch(`/api/video/generations/${generationId}`);

          if (res.ok) {
            const data = await res.json();
            const generation = data.generation as VideoGeneration;

            // Check if generation is now complete or failed
            if (
              generation.status === "completed" ||
              generation.status === "failed"
            ) {
              // Determine if we should notify
              const isStoryboardOpen = pathname === "/storyboard";
              const isHidden = document.hidden;

              // Notify if: Tab is hidden OR User is not on storyboard
              if (isHidden || !isStoryboardOpen) {
                const isSuccess = generation.status === "completed";

                try {
                  if (
                    "Notification" in window &&
                    Notification.permission === "granted"
                  ) {
                    const notification = new Notification("Moodio Agent", {
                      body: isSuccess
                        ? "Your video generation is complete!"
                        : t(getUserFriendlyErrorKey(generation.error)),
                      icon: "/favicon.ico",
                      tag: `video-${generationId}`,
                    });

                    notification.onclick = () => {
                      window.focus();
                      router.push("/storyboard");
                      notification.close();
                    };
                  }
                } catch (e) {
                  console.error("Error showing notification:", e);
                }

                // Also show toast if user is active but on different page
                if (!isHidden && !isStoryboardOpen) {
                  addToast({
                    title: isSuccess ? "Video Ready" : "Video Failed",
                    description: isSuccess
                      ? "Your video generation is complete!"
                      : t(getUserFriendlyErrorKey(generation.error)),
                    color: isSuccess ? "success" : "danger",
                    endContent: (
                      <button
                        onClick={() => router.push("/storyboard")}
                        className="text-xs font-medium underline hover:opacity-80 text-current px-2 py-1 rounded"
                      >
                        View
                      </button>
                    ),
                  });
                }
              }

              // Stop monitoring this generation
              setMonitoredGenerations((prev) => {
                const newState = { ...prev };
                delete newState[generationId];
                return newState;
              });
            }
          }
        } catch (e) {
          console.error(`Error polling video generation ${generationId}`, e);
        }
      }
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [user, pathname, router]);

  return (
    <VideoContext.Provider
      value={{
        monitoredGenerations: Object.keys(monitoredGenerations),
        monitorGeneration,
        cancelMonitorGeneration,
        isGenerationMonitored,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
}
