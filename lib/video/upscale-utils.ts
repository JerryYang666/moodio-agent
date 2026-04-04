import { getVideoUrl, getSignedVideoUrl } from "@/lib/storage/s3";

const PARAMS_KEY_1080P = "_upscaled_1080p_video_id";
const PARAMS_KEY_4K = "_upscaled_4k_video_id";

export interface UpscaledVideos {
  "1080p": { videoId: string; videoUrl: string; signedVideoUrl: string } | null;
  "4k": { videoId: string; videoUrl: string; signedVideoUrl: string } | null;
}

export function resolveUpscaledVideos(
  params: Record<string, any> | null | undefined
): UpscaledVideos {
  const result: UpscaledVideos = { "1080p": null, "4k": null };
  if (!params) return result;

  const id1080p = params[PARAMS_KEY_1080P] as string | undefined;
  if (id1080p) {
    result["1080p"] = {
      videoId: id1080p,
      videoUrl: getVideoUrl(id1080p),
      signedVideoUrl: getSignedVideoUrl(id1080p),
    };
  }

  const id4k = params[PARAMS_KEY_4K] as string | undefined;
  if (id4k) {
    result["4k"] = {
      videoId: id4k,
      videoUrl: getVideoUrl(id4k),
      signedVideoUrl: getSignedVideoUrl(id4k),
    };
  }

  return result;
}
