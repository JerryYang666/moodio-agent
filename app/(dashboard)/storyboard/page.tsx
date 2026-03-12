"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import { useTranslations } from "next-intl";
import { Sparkles, Folder, TriangleAlert, X } from "lucide-react";
import VideoGenerationPanel, {
  VideoGenerationRestore,
} from "@/components/storyboard/video-generation-panel";
import VideoList from "@/components/storyboard/video-list";
import ChatSidePanel from "@/components/chat/chat-side-panel";
import { siteConfig } from "@/config/site";

const DEFAULT_PANEL_WIDTH = 380;
const COLLAPSED_WIDTH = 48;

function StoryboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("storyboard");
  const imageIdParam = searchParams.get("imageId");

  const [initialImageId, setInitialImageId] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(!!imageIdParam);
  const [restoreData, setRestoreData] = useState<VideoGenerationRestore | null>(
    null
  );
  const BANNER_KEY = "moodio:storyboard-deprecation-dismissed";
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(BANNER_KEY) === "true";
  });
  
  // Chat panel collapse state - defaults to expanded (false = not collapsed)
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(siteConfig.chatPanelCollapsed) === "true";
  });

  // Chat panel width state
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const stored = localStorage.getItem(siteConfig.chatPanelWidth);
    return stored ? parseInt(stored, 10) : DEFAULT_PANEL_WIDTH;
  });

  const handleChatPanelCollapseChange = useCallback((collapsed: boolean) => {
    setIsChatPanelCollapsed(collapsed);
    localStorage.setItem(siteConfig.chatPanelCollapsed, String(collapsed));
  }, []);

  const handleChatPanelWidthChange = useCallback((width: number) => {
    setChatPanelWidth(width);
  }, []);

  // Fetch CloudFront URL for initial image if provided
  useEffect(() => {
    if (!imageIdParam) {
      setLoading(false);
      return;
    }

    const fetchImageUrl = async () => {
      try {
        // Get CloudFront URL from server
        const res = await fetch(`/api/image/${imageIdParam}`);
        if (res.ok) {
          const data = await res.json();
          setInitialImageId(imageIdParam);
          setInitialImageUrl(data.imageUrl);
        }
      } catch (e) {
        console.error("Failed to fetch image URL:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchImageUrl();
  }, [imageIdParam]);

  const handleGenerationStarted = (generationId: string) => {
    // Trigger a refresh of the video list
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleRestore = useCallback((data: VideoGenerationRestore) => {
    setRestoreData(data);
  }, []);

  const handleRestoreComplete = useCallback(() => {
    setRestoreData(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-env(safe-area-inset-bottom))] md:h-screen flex flex-col">
      {/* Deprecation Banner */}
      {!bannerDismissed && (
        <div className="shrink-0 flex items-start gap-3 px-4 py-3 bg-warning-50 dark:bg-warning-900/20 border-b border-warning-200 dark:border-warning-700 text-warning-800 dark:text-warning-300">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("deprecationTitle")}</p>
            <p className="text-sm opacity-80 mt-0.5">{t("deprecationDescription")}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => router.push("/chat")}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-warning-100 dark:bg-warning-800/40 hover:bg-warning-200 dark:hover:bg-warning-700/40 transition-colors"
              >
                <Sparkles size={13} />
                {t("goToGeneration")}
              </button>
              <button
                onClick={() => router.push("/projects")}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-warning-100 dark:bg-warning-800/40 hover:bg-warning-200 dark:hover:bg-warning-700/40 transition-colors"
              >
                <Folder size={13} />
                {t("goToAssets")}
              </button>
            </div>
          </div>
          <button
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem(BANNER_KEY, "true");
            }}
            className="shrink-0 p-1 rounded-lg hover:bg-warning-100 dark:hover:bg-warning-800/40 transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
      <div className="absolute inset-0 flex flex-col lg:flex-row gap-4 p-3 sm:p-4 lg:gap-0 lg:p-0">
        {/* Left Panel - Video Generation */}
        <div className="w-full lg:w-[400px] shrink-0 min-h-0 lg:h-full flex flex-col overflow-hidden lg:p-4">
          <VideoGenerationPanel
            initialImageId={initialImageId}
            initialImageUrl={initialImageUrl}
            onGenerationStarted={handleGenerationStarted}
            restoreData={restoreData}
            onRestoreComplete={handleRestoreComplete}
          />
        </div>

        {/* Middle Panel - Video List */}
        <div className="flex-1 min-w-0 min-h-[300px] lg:min-h-0 lg:h-full flex flex-col overflow-hidden lg:py-4 lg:pr-4">
          <VideoList refreshTrigger={refreshTrigger} onRestore={handleRestore} />
        </div>

        {/* Right Panel - Chat Side Panel (Desktop only) */}
        <div
          className="hidden lg:block shrink-0 h-full"
          style={{ 
            width: isChatPanelCollapsed ? COLLAPSED_WIDTH : chatPanelWidth,
            transition: isChatPanelCollapsed ? 'width 0.3s ease-in-out' : undefined
          }}
        >
          <ChatSidePanel
            defaultExpanded={!isChatPanelCollapsed}
            onCollapseChange={handleChatPanelCollapseChange}
            onWidthChange={handleChatPanelWidthChange}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

export default function StoryboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Spinner size="lg" />
        </div>
      }
    >
      <StoryboardContent />
    </Suspense>
  );
}
