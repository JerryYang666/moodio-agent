import type { LinkAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";
import { ExternalLink } from "lucide-react";

interface LinkAssetProps {
  asset: EnrichedDesktopAsset;
}

export default function LinkAsset({ asset }: LinkAssetProps) {
  const meta = asset.metadata as unknown as LinkAssetMeta;

  if (meta.thumbnailUrl) {
    return (
      <>
        <img
          src={meta.thumbnailUrl}
          alt={meta.title || meta.url}
          draggable={false}
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-1.5 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <ExternalLink size={10} />
          {meta.title || meta.url}
        </div>
      </>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-default-400 bg-background p-4">
      <ExternalLink size={24} />
      <span className="text-xs text-center truncate w-full">{meta.title || meta.url}</span>
    </div>
  );
}
