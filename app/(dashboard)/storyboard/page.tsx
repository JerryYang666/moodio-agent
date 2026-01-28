"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import VideoGenerationPanel, {
  VideoGenerationRestore,
} from "@/components/storyboard/video-generation-panel";
import VideoList from "@/components/storyboard/video-list";

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
      <div className="absolute inset-0 flex flex-col lg:flex-row gap-4 p-3 sm:p-4">
        {/* Left Panel - Video Generation */}
        <div className="w-full lg:w-[400px] shrink-0 min-h-0 lg:h-full flex flex-col overflow-hidden">
          <VideoGenerationPanel
            initialImageId={initialImageId}
            initialImageUrl={initialImageUrl}
            onGenerationStarted={handleGenerationStarted}
            restoreData={restoreData}
            onRestoreComplete={handleRestoreComplete}
          />
        </div>

        {/* Right Panel - Video List */}
        <div className="flex-1 min-w-0 min-h-[300px] lg:min-h-0 lg:h-full flex flex-col overflow-hidden">
          <VideoList refreshTrigger={refreshTrigger} onRestore={handleRestore} />
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
