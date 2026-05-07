import { fal } from "@fal-ai/client";
import type { VideoProviderClient, VideoGenerationResult } from "./index";

fal.config({
  credentials: process.env.FAL_API_KEY,
});

interface FalQueueStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: Array<{ message: string; timestamp: string }>;
}

// ---------------------------------------------------------------------------
// Seedance 2.0 dynamic endpoint routing
// ---------------------------------------------------------------------------

const SEEDANCE2_BASES = new Set([
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0/fast",
]);

const KLING_O3_REFERENCE_BASE = "fal-ai/kling-video/o3/reference-to-video";
const KLING_V3_PRO_I2V = "fal-ai/kling-video/v3/pro/image-to-video";

/**
 * Normalize a `kling_elements` array into FAL's `elements` shape.
 *
 * - Drops entries with no images (defensive — UI prevents it).
 * - imageIds are already resolved to URLs by the route hydrator (it sets
 *   `element_input_urls` on each entry).
 * - When `videoId` is set on the entry (the library element has an attached
 *   video), it's already been resolved to a signed URL surfaced as `videoUrl`
 *   on the entry — both Kling V3 image-to-video and Kling O3 reference-to-video
 *   accept `video_url` per element (undocumented in their llms.txt but
 *   supported by the API).
 * - When `voiceId` is set (the library element has a FAL-provider voice id),
 *   it's mapped to `voice_id` per element. Same status: undocumented in
 *   llms.txt but supported by both Kling V3 and O3.
 * - name/description are the user-facing fields; FAL accepts an optional
 *   `name` (used for prompt @-references) and optional `description`.
 */
function normalizeFalKlingElements(
  raw: any[]
): Array<Record<string, unknown>> {
  return raw
    .map((el: any) => {
      const urls: string[] = Array.isArray(el?.element_input_urls)
        ? el.element_input_urls
        : [];
      const hasVideo =
        typeof el?.videoUrl === "string" && el.videoUrl.length > 0;
      // FAL constraint: an element is EITHER image-based (frontal_image_url +
      // reference_image_urls) OR video-based (video_url, with optional
      // voice_id). Sending both shapes returns 422:
      //   "Cannot provide both image URLs and video URL for the same element."
      // When a library element has both attached (allowed for forward-compat
      // with future models), prefer the video shape — voice_id depends on it,
      // and the user explicitly attached a video. The unused images stay on
      // the library row and flow through to other providers (e.g. KSyun, which
      // only accepts image elements).
      if (hasVideo) {
        const out: Record<string, unknown> = { video_url: el.videoUrl };
        if (typeof el?.name === "string" && el.name) out.name = el.name;
        if (typeof el?.description === "string" && el.description) {
          out.description = el.description;
        }
        if (typeof el?.voiceId === "string" && el.voiceId) {
          out.voice_id = el.voiceId;
        }
        return out;
      }
      if (urls.length === 0) return null;
      const out: Record<string, unknown> = {
        frontal_image_url: urls[0],
        reference_image_urls: urls.slice(1),
      };
      if (typeof el?.name === "string" && el.name) out.name = el.name;
      if (typeof el?.description === "string" && el.description) {
        out.description = el.description;
      }
      // voice_id is rejected on image elements — only sent on video elements above.
      return out;
    })
    .filter((e): e is Record<string, unknown> => e !== null);
}

/**
 * For Seedance 2.0 models, resolve the actual Fal sub-endpoint
 * (text-to-video / image-to-video / reference-to-video) based on
 * which media params are present. Non-Seedance models pass through.
 */
function resolveFalEndpoint(
  providerModelId: string,
  params: Record<string, any>
): { endpoint: string; input: Record<string, any> } {
  // Kling O3 reference-to-video: select std vs pro endpoint from `mode` param.
  if (providerModelId === KLING_O3_REFERENCE_BASE) {
    const {
      mode,
      multi_shots,
      prompt,
      multi_prompt,
      media_references,
      elements,
      ...rest
    } = params;

    // prompt / multi_prompt are mutually exclusive per the FAL API.
    if (
      multi_shots === true &&
      Array.isArray(multi_prompt) &&
      multi_prompt.length > 0
    ) {
      // FAL requires per-shot duration as a string literal ('1'..'15'), not a number.
      rest.multi_prompt = multi_prompt.map((shot: any) => ({
        ...shot,
        duration: String(shot.duration),
      }));
    } else if (typeof prompt === "string" && prompt.trim().length > 0) {
      rest.prompt = prompt;
    }

    // Convert media_references (image-only) → image_urls for FAL.
    if (Array.isArray(media_references) && media_references.length > 0) {
      const imageUrls = media_references
        .filter((r: any) => r.type === "image")
        .map((r: any) => r.id);
      if (imageUrls.length > 0) {
        rest.image_urls = imageUrls;
      }
    }

    // FAL Kling O3 elements: first image is the frontal view, rest are style refs.
    // Names are typically positional (Element1..N) from the UI — referenced in
    // prompts as @Element1, @Element2 with no rewriting needed.
    if (Array.isArray(elements)) {
      const normalized = normalizeFalKlingElements(elements);
      if (normalized.length > 0) {
        rest.elements = normalized;
      }
    }

    const tier =
      mode === "pro" ? "pro" : mode === "4k" ? "4k" : "standard";
    return {
      endpoint: `fal-ai/kling-video/o3/${tier}/reference-to-video`,
      input: rest,
    };
  }

  // Kling V3 Pro image-to-video: supports `elements` with frontal_image_url +
  // reference_image_urls + optional video_url per element.
  if (providerModelId === KLING_V3_PRO_I2V) {
    const { kling_elements, elements, ...rest } = params;
    const raw =
      Array.isArray(elements) && elements.length > 0
        ? elements
        : Array.isArray(kling_elements)
          ? kling_elements
          : null;
    if (raw) {
      const normalized = normalizeFalKlingElements(raw);
      if (normalized.length > 0) {
        rest.elements = normalized;
      }
    }
    return { endpoint: providerModelId, input: rest };
  }

  if (!SEEDANCE2_BASES.has(providerModelId)) {
    return { endpoint: providerModelId, input: params };
  }

  const { media_references, image_url, web_search, ...rest } = params;

  if (rest.aspect_ratio === "adaptive") rest.aspect_ratio = "auto";

  if (Array.isArray(media_references) && media_references.length > 0) {
    const imageUrls = media_references
      .filter((r: any) => r.type === "image")
      .map((r: any) => r.id);
    const videoUrls = media_references
      .filter((r: any) => r.type === "video")
      .map((r: any) => r.id);
    const audioUrls = media_references
      .filter((r: any) => r.type === "audio")
      .map((r: any) => r.id);
    return {
      endpoint: `${providerModelId}/reference-to-video`,
      input: {
        ...rest,
        ...(imageUrls.length > 0 && { image_urls: imageUrls }),
        ...(videoUrls.length > 0 && { video_urls: videoUrls }),
        ...(audioUrls.length > 0 && { audio_urls: audioUrls }),
      },
    };
  }

  if (image_url) {
    return {
      endpoint: `${providerModelId}/image-to-video`,
      input: { ...rest, image_url },
    };
  }

  return {
    endpoint: `${providerModelId}/text-to-video`,
    input: rest,
  };
}

// ---------------------------------------------------------------------------

export class FalVideoProvider implements VideoProviderClient {
  async submitGeneration(
    providerModelId: string,
    params: Record<string, any>,
    webhookUrl: string
  ): Promise<{ requestId: string; providerModelId?: string }> {
    const { endpoint, input } = resolveFalEndpoint(providerModelId, params);
    const result = await fal.queue.submit(endpoint, {
      input,
      webhookUrl,
    });
    return {
      requestId: result.request_id,
      ...(endpoint !== providerModelId && { providerModelId: endpoint }),
    };
  }

  async getStatus(
    providerModelId: string,
    requestId: string
  ): Promise<{ status: "in_queue" | "in_progress" | "completed" | "failed" }> {
    const response = (await fal.queue.status(providerModelId, {
      requestId,
      logs: true,
    })) as FalQueueStatus;

    const statusMap: Record<string, "in_queue" | "in_progress" | "completed" | "failed"> = {
      IN_QUEUE: "in_queue",
      IN_PROGRESS: "in_progress",
      COMPLETED: "completed",
      FAILED: "failed",
    };
    return { status: statusMap[response.status] ?? "failed" };
  }

  async getResult(
    providerModelId: string,
    requestId: string
  ): Promise<{ data: any }> {
    return await fal.queue.result(providerModelId, { requestId });
  }

  async tryRecover(
    providerModelId: string,
    requestId: string
  ): Promise<{
    status: "completed" | "in_progress" | "failed";
    result?: VideoGenerationResult;
    error?: string;
  }> {
    try {
      const statusResponse = (await fal.queue.status(providerModelId, {
        requestId,
        logs: false,
      })) as FalQueueStatus;

      if (
        statusResponse.status === "IN_QUEUE" ||
        statusResponse.status === "IN_PROGRESS"
      ) {
        return { status: "in_progress" };
      }

      if (statusResponse.status === "FAILED") {
        return { status: "failed", error: "Generation failed on Fal" };
      }

      if (statusResponse.status === "COMPLETED") {
        const resultResponse = await fal.queue.result(providerModelId, {
          requestId,
        });
        const result = resultResponse.data as VideoGenerationResult;

        if (!result?.video?.url) {
          return { status: "failed", error: "No video URL in result" };
        }
        return { status: "completed", result };
      }

      return {
        status: "failed",
        error: `Unknown status: ${statusResponse.status}`,
      };
    } catch (error: any) {
      console.error("[Fal Recovery] Error recovering generation:", error);
      return {
        status: "failed",
        error: error.message || "Failed to recover from Fal",
      };
    }
  }
}
