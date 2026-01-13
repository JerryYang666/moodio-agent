"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@heroui/spinner";
import VideoGenerationPanel from "@/components/storyboard/video-generation-panel";
import VideoList from "@/components/storyboard/video-list";
import { getSignedImageUrl } from "@/lib/storage/s3";

function StoryboardContent() {
  const searchParams = useSearchParams();
  const imageIdParam = searchParams.get("imageId");

  const [initialImageId, setInitialImageId] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(!!imageIdParam);

  // Fetch signed URL for initial image if provided
  useEffect(() => {
    if (!imageIdParam) {
      setLoading(false);
      return;
    }

    const fetchImageUrl = async () => {
      try {
        // Get signed URL from server
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
    <div className="flex flex-col lg:flex-row gap-4 h-full p-4 overflow-hidden">
      {/* Left Panel - Video Generation */}
      <div className="lg:w-[400px] shrink-0 overflow-auto">
        <VideoGenerationPanel
          initialImageId={initialImageId}
          initialImageUrl={initialImageUrl}
          onGenerationStarted={handleGenerationStarted}
        />
      </div>

      {/* Right Panel - Video List */}
      <div className="flex-1 min-w-0 overflow-hidden">
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
