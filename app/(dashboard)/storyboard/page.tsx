"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
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
  const imageIdParam = searchParams.get("imageId");

  const [initialImageId, setInitialImageId] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(!!imageIdParam);
  const [restoreData, setRestoreData] = useState<VideoGenerationRestore | null>(
    null
  );
  
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
    <div className="relative h-[calc(100vh-env(safe-area-inset-bottom))] md:h-screen">
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
