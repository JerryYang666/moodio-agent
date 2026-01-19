"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import VideoGenerationPanel from "@/components/storyboard/video-generation-panel";
import VideoList from "@/components/storyboard/video-list";

function StoryboardContent() {
  const searchParams = useSearchParams();
  const imageIdParam = searchParams.get("imageId");

  const [initialImageId, setInitialImageId] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(!!imageIdParam);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-full lg:h-full p-3 sm:p-4 lg:overflow-hidden">
      {/* Left Panel - Video Generation */}
      <div className="w-full lg:w-[400px] shrink-0 lg:h-full lg:overflow-auto">
        <VideoGenerationPanel
          initialImageId={initialImageId}
          initialImageUrl={initialImageUrl}
          onGenerationStarted={handleGenerationStarted}
        />
      </div>

      {/* Right Panel - Video List */}
      <div className="flex-1 min-w-0 min-h-[400px] lg:min-h-0 lg:overflow-hidden">
        <VideoList refreshTrigger={refreshTrigger} />
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
