import type { TextAssetMeta } from "@/lib/desktop/types";
import type { EnrichedDesktopAsset } from "./types";

interface TextAssetProps {
  asset: EnrichedDesktopAsset;
}

export default function TextAsset({ asset }: TextAssetProps) {
  const meta = asset.metadata as unknown as TextAssetMeta;

  return (
    <div
      className="w-full h-full p-3 overflow-auto text-foreground bg-background"
      style={{ fontSize: meta.fontSize || 14, color: meta.color }}
    >
      {meta.content || ""}
    </div>
  );
}
