import type { VideoAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import {
  Play,
  Loader2,
  Clock,
  AlertCircle,
  Video,
} from "lucide-react";

interface VideoAssetProps {
  asset: EnrichedDesktopAsset;
  onImageLoad: (assetId: string, naturalWidth: number, naturalHeight: number) => void;
}

export default function VideoAsset({ asset, onImageLoad }: VideoAssetProps) {
  const meta = asset.metadata as unknown as VideoAssetMeta;
  const src = asset.imageUrl;
  const genStatus = asset.generationData?.status || meta.status;
  const isProcessing = genStatus === "pending" || genStatus === "processing";
  const isFailed = genStatus === "failed";
  const isCompleted = genStatus === "completed" || !!meta.videoId;

  if (!src) {
    return (
      <div className="w-full h-full bg-default-200 flex flex-col items-center justify-center gap-2 p-4">
        {isProcessing && (
          <>
            <Loader2 size={24} className="text-primary animate-spin" />
            <span className="text-xs text-default-500">Generating...</span>
          </>
        )}
        {isFailed && (
          <>
            <AlertCircle size={24} className="text-danger" />
            <span className="text-xs text-danger">Failed</span>
          </>
        )}
        {!isProcessing && !isFailed && (
          <>
            <Video size={24} className="text-default-400" />
            <span className="text-xs text-default-400">{meta.title || "Video"}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={meta.title || "Video"}
        draggable={false}
        className="w-full h-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          onImageLoad(asset.id, img.naturalWidth, img.naturalHeight);
        }}
      />
      <div className="absolute top-2 left-2 z-10">
        {isProcessing ? (
          <div className="bg-primary/80 text-white rounded-full p-1.5 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            <span className="text-[9px] font-medium pr-0.5">Processing</span>
          </div>
        ) : isFailed ? (
          <div className="bg-danger/80 text-white rounded-full p-1.5 flex items-center gap-1">
            <AlertCircle size={10} />
            <span className="text-[9px] font-medium pr-0.5">Failed</span>
          </div>
        ) : isCompleted ? (
          <div className="bg-black/70 text-white rounded-full p-1 flex items-center gap-1">
            <Play size={10} fill="white" />
          </div>
        ) : (
          <div className="bg-default-500/70 text-white rounded-full p-1.5 flex items-center gap-1">
            <Clock size={10} />
            <span className="text-[9px] font-medium pr-0.5">Pending</span>
          </div>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {meta.title || "Untitled video"}
      </div>
    </>
  );
}
