"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import {
  Video,
  RefreshCw,
  Play,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface VideoGeneration {
  id: string;
  modelId: string;
  status: "pending" | "processing" | "completed" | "failed";
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error: string | null;
  seed: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface VideoListProps {
  refreshTrigger?: number;
}

const POLL_INTERVAL = 5000; // 5 seconds

export default function VideoList({ refreshTrigger }: VideoListProps) {
  const [generations, setGenerations] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoGeneration | null>(null);

  const fetchGenerations = useCallback(async () => {
    try {
      const res = await fetch("/api/video/generations?limit=50");
      if (!res.ok) throw new Error("Failed to fetch generations");
      const data = await res.json();
      setGenerations(data.generations);
      setError(null);
    } catch (e) {
      console.error("Error fetching generations:", e);
      setError("Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      fetchGenerations();
    }
  }, [refreshTrigger, fetchGenerations]);

  // Poll for updates when there are pending/processing jobs
  useEffect(() => {
    const hasPending = generations.some(
      (g) => g.status === "pending" || g.status === "processing"
    );

    if (!hasPending) return;

    const interval = setInterval(fetchGenerations, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [generations, fetchGenerations]);

  const getStatusIcon = (status: VideoGeneration["status"]) => {
    switch (status) {
      case "pending":
        return <Clock size={14} className="text-default-400" />;
      case "processing":
        return <Loader2 size={14} className="text-primary animate-spin" />;
      case "completed":
        return <CheckCircle size={14} className="text-success" />;
      case "failed":
        return <XCircle size={14} className="text-danger" />;
    }
  };

  const getStatusColor = (status: VideoGeneration["status"]) => {
    switch (status) {
      case "pending":
        return "default";
      case "processing":
        return "primary";
      case "completed":
        return "success";
      case "failed":
        return "danger";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDownload = async (videoUrl: string, filename: string) => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download error:", e);
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardBody className="flex items-center justify-center">
          <Spinner />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full overflow-hidden flex flex-col">
        <CardHeader className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Video size={20} className="text-primary" />
            <h2 className="text-lg font-semibold">Your Videos</h2>
            <Chip size="sm" variant="flat">
              {generations.length}
            </Chip>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={fetchGenerations}
          >
            <RefreshCw size={16} />
          </Button>
        </CardHeader>

        <CardBody className="overflow-auto pt-0">
          {error && (
            <div className="text-sm text-danger bg-danger-50 p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {generations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Video size={48} className="text-default-300 mb-4" />
              <p className="text-default-500">No videos yet</p>
              <p className="text-sm text-default-400">
                Generate your first video from an image
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {generations.map((gen) => (
                <button
                  key={gen.id}
                  onClick={() => setSelectedVideo(gen)}
                  className="text-left group"
                >
                  <div className="rounded-lg overflow-hidden border border-divider bg-default-50 hover:border-primary transition-colors">
                    {/* Thumbnail */}
                    <div className="relative aspect-video bg-default-100">
                      <Image
                        src={gen.thumbnailUrl || gen.sourceImageUrl}
                        alt="Video thumbnail"
                        classNames={{
                          wrapper: "w-full h-full !max-w-full",
                          img: "w-full h-full object-cover",
                        }}
                      />
                      
                      {/* Status Overlay */}
                      {gen.status !== "completed" && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          {gen.status === "processing" && (
                            <div className="text-center">
                              <Loader2 size={32} className="text-white animate-spin mx-auto mb-2" />
                              <span className="text-white text-sm">Generating...</span>
                            </div>
                          )}
                          {gen.status === "pending" && (
                            <div className="text-center">
                              <Clock size={32} className="text-white mx-auto mb-2" />
                              <span className="text-white text-sm">Queued</span>
                            </div>
                          )}
                          {gen.status === "failed" && (
                            <div className="text-center">
                              <XCircle size={32} className="text-danger mx-auto mb-2" />
                              <span className="text-white text-sm">Failed</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Play Button Overlay */}
                      {gen.status === "completed" && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black/50 rounded-full p-3">
                            <Play size={24} className="text-white" fill="white" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <Chip
                          size="sm"
                          variant="flat"
                          color={getStatusColor(gen.status)}
                          startContent={getStatusIcon(gen.status)}
                        >
                          {gen.status}
                        </Chip>
                        <span className="text-xs text-default-400">
                          {formatDate(gen.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-default-600 line-clamp-2">
                        {gen.params.prompt || "No prompt"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Video Detail Modal */}
      <Modal
        isOpen={!!selectedVideo}
        onOpenChange={() => setSelectedVideo(null)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <Video size={20} />
                Video Details
              </ModalHeader>
              <ModalBody>
                {selectedVideo && (
                  <div className="space-y-4">
                    {/* Video Player / Preview */}
                    <div className="rounded-lg overflow-hidden bg-black">
                      {selectedVideo.status === "completed" && selectedVideo.videoUrl ? (
                        <video
                          src={selectedVideo.videoUrl}
                          controls
                          autoPlay
                          className="w-full max-h-[60vh]"
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center">
                          <Image
                            src={selectedVideo.thumbnailUrl || selectedVideo.sourceImageUrl}
                            alt="Thumbnail"
                            classNames={{
                              wrapper: "w-full h-full",
                              img: "w-full h-full object-contain",
                            }}
                          />
                          {selectedVideo.status !== "completed" && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              {selectedVideo.status === "processing" && (
                                <Loader2 size={48} className="text-white animate-spin" />
                              )}
                              {selectedVideo.status === "pending" && (
                                <Clock size={48} className="text-white" />
                              )}
                              {selectedVideo.status === "failed" && (
                                <XCircle size={48} className="text-danger" />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status & Info */}
                    <div className="flex items-center gap-4">
                      <Chip
                        color={getStatusColor(selectedVideo.status)}
                        startContent={getStatusIcon(selectedVideo.status)}
                      >
                        {selectedVideo.status}
                      </Chip>
                      <span className="text-sm text-default-500">
                        Created: {formatDate(selectedVideo.createdAt)}
                      </span>
                      {selectedVideo.completedAt && (
                        <span className="text-sm text-default-500">
                          Completed: {formatDate(selectedVideo.completedAt)}
                        </span>
                      )}
                      {selectedVideo.seed && (
                        <span className="text-sm text-default-500">
                          Seed: {selectedVideo.seed}
                        </span>
                      )}
                    </div>

                    {/* Error */}
                    {selectedVideo.error && (
                      <div className="text-sm text-danger bg-danger-50 p-3 rounded-lg">
                        {selectedVideo.error}
                      </div>
                    )}

                    {/* Prompt */}
                    <div className="bg-default-100 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Prompt</h4>
                      <p className="text-default-600 whitespace-pre-wrap">
                        {selectedVideo.params.prompt || "No prompt"}
                      </p>
                    </div>

                    {/* Parameters */}
                    <div className="bg-default-100 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Parameters</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        {Object.entries(selectedVideo.params)
                          .filter(([key]) => key !== "prompt" && key !== "image_url" && key !== "end_image_url")
                          .map(([key, value]) => (
                            <div key={key}>
                              <span className="text-default-500">{key}: </span>
                              <span className="text-default-700">{String(value)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                {selectedVideo?.status === "completed" && selectedVideo.videoUrl && (
                  <>
                    <Button
                      variant="flat"
                      startContent={<ExternalLink size={16} />}
                      onPress={() => window.open(selectedVideo.videoUrl!, "_blank")}
                    >
                      Open in New Tab
                    </Button>
                    <Button
                      color="primary"
                      startContent={<Download size={16} />}
                      onPress={() =>
                        handleDownload(
                          selectedVideo.videoUrl!,
                          `video-${selectedVideo.id}.mp4`
                        )
                      }
                    >
                      Download
                    </Button>
                  </>
                )}
                <Button variant="light" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
