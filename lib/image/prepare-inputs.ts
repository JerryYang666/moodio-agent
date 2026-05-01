import { downloadImage, getSignedImageUrl } from "@/lib/storage/s3";
import { reuploadArrayForKie } from "@/lib/kie/client";
import type { ImageModelProvider } from "./models";

/**
 * Per-request, per-image-id memoised preparation of reference images for the
 * active image provider.
 *
 *   - google / openai → download + base64-encode each image once
 *   - kie             → ingest each image into KIE's temp storage once
 *   - fal             → nothing (provider only needs signed CloudFront URLs)
 *
 * Both the direct image-generation route and the Agent 2 handler funnel
 * through the same preparer so 4 parallel variants — or N parallel agent
 * suggestions — share the same downloads / KIE uploads instead of each one
 * doing the work independently. Failures for individual images are dropped
 * silently rather than rejecting the whole array, matching prior behaviour.
 */
export interface ImageInputPreparer {
  provider: ImageModelProvider | undefined;
  /**
   * Returns the subset of `ImageEditInput` fields the provider needs for
   * `imageIds`. Other fields stay undefined and no work is started for them.
   * Each id is fetched at most once across the lifetime of this preparer,
   * across every call.
   */
  prepareEditInputs(imageIds: string[]): Promise<{
    imageBase64?: string[];
    imageInputUrls?: string[];
  }>;
}

export function createImageInputPreparer(
  provider: ImageModelProvider | undefined
): ImageInputPreparer {
  const base64Cache = new Map<string, Promise<string | undefined>>();
  const kieUrlCache = new Map<string, Promise<string | undefined>>();

  const needsBase64 = provider === "google" || provider === "openai";
  const needsKieUrls = provider === "kie";

  return {
    provider,
    async prepareEditInputs(imageIds) {
      if (imageIds.length === 0) return {};

      if (needsBase64) {
        const base64 = await Promise.all(
          imageIds.map((id) => {
            let p = base64Cache.get(id);
            if (!p) {
              p = downloadImage(id)
                .then((buf) => buf?.toString("base64"))
                .catch(() => undefined);
              base64Cache.set(id, p);
            }
            return p;
          })
        );
        return {
          imageBase64: base64.filter((s): s is string => Boolean(s)),
        };
      }

      if (needsKieUrls) {
        const ingest = async (id: string): Promise<string | undefined> => {
          try {
            const [out] = await reuploadArrayForKie(
              [getSignedImageUrl(id)],
              "moodio/image-inputs",
              { allowWebp: true }
            );
            return out;
          } catch {
            return undefined;
          }
        };
        const urls = await Promise.all(
          imageIds.map((id) => {
            let p = kieUrlCache.get(id);
            if (!p) {
              p = ingest(id);
              kieUrlCache.set(id, p);
            }
            return p;
          })
        );
        // KIE expects the array to be 1:1 with imageIds. If any ingest failed,
        // hand the provider an empty list so it falls back to its in-process
        // re-upload path rather than feeding it a sparse array.
        const valid = urls.filter((u): u is string => Boolean(u));
        return {
          imageInputUrls: valid.length === imageIds.length ? valid : undefined,
        };
      }

      return {};
    },
  };
}
