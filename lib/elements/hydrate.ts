import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { collectionImages, projects } from "@/lib/db/schema";
import {
  buildElementDetails,
  ksyunSourceFingerprint,
} from "@/lib/elements/helpers";
import {
  getSignedImageUrl,
  getSignedVideoUrl,
} from "@/lib/storage/s3";

export interface KsyunElementWriteBack {
  libraryElementId: string;
  ksyunElementId: number;
}

/**
 * Resolve `kling_elements` entries against the library when they carry a
 * `libraryElementId`. The library row is the source of truth: name,
 * description, imageIds, videoId, and any cached KSyun element_id come from
 * the DB regardless of what the chat-side snapshot says, so a stale snapshot
 * (e.g. from a draft saved before the user edited the element) can't desync.
 *
 * Image IDs are signed to CloudFront URLs (`element_input_urls`) and the
 * optional video is signed to a CloudFront URL surfaced as `videoUrl` (FAL
 * Kling V3 maps it to `video_url` per its llms.txt). A previously-cached
 * `ksyunElementId` is only carried through if its source fingerprint still
 * matches the current imageIds — otherwise it's dropped and the next KSyun
 * submission will re-mint and re-cache.
 *
 * Mutates `params.kling_elements` in place (replacing each entry with the
 * provider-shaped object). No-op for entries without `libraryElementId` —
 * those keep their pre-existing element_input_ids/element_input_urls path
 * for compatibility with the legacy ad-hoc element editor.
 */
export async function hydrateKlingElementsFromLibrary(
  params: Record<string, any>,
  userId: string
): Promise<void> {
  if (!Array.isArray(params.kling_elements)) return;
  const rawEntries: any[] = params.kling_elements;

  const libIds = rawEntries
    .map((e) => (typeof e?.libraryElementId === "string" ? e.libraryElementId : null))
    .filter((id): id is string => id !== null);

  const libRows = libIds.length > 0
    ? await db
        .select({
          id: collectionImages.id,
          userId: projects.userId,
          elementDetails: collectionImages.elementDetails,
          generationDetails: collectionImages.generationDetails,
        })
        .from(collectionImages)
        .innerJoin(projects, eq(collectionImages.projectId, projects.id))
        .where(
          and(
            inArray(collectionImages.id, libIds),
            eq(collectionImages.assetType, "element")
          )
        )
    : [];
  const libById = new Map(libRows.map((r) => [r.id, r]));

  params.kling_elements = rawEntries.map((el: any) => {
    let name: string = typeof el?.name === "string" ? el.name : "";
    let description: string =
      typeof el?.description === "string" ? el.description : "";
    let inputIds: string[] = Array.isArray(el?.element_input_ids)
      ? el.element_input_ids
      : Array.isArray(el?.element_input_urls)
        ? el.element_input_urls
        : [];
    let videoId: string | undefined;
    let cachedKsyunId: number | undefined;
    let cachedFingerprint: string | undefined;

    if (typeof el?.libraryElementId === "string") {
      const row = libById.get(el.libraryElementId);
      if (row && row.userId === userId) {
        const det = (row.elementDetails ?? {}) as {
          imageIds?: unknown;
          videoId?: unknown;
          ksyunElementId?: unknown;
          ksyunSourceFingerprint?: unknown;
        };
        const gen = (row.generationDetails ?? {}) as {
          title?: unknown;
          prompt?: unknown;
        };
        if (typeof gen.title === "string" && gen.title) name = gen.title;
        if (typeof gen.prompt === "string") description = gen.prompt;
        if (Array.isArray(det.imageIds)) {
          const arr = (det.imageIds as unknown[]).filter(
            (v): v is string => typeof v === "string"
          );
          if (arr.length > 0) inputIds = arr;
        }
        if (typeof det.videoId === "string" && det.videoId) {
          videoId = det.videoId;
        }
        if (typeof det.ksyunElementId === "number") {
          cachedKsyunId = det.ksyunElementId;
          cachedFingerprint =
            typeof det.ksyunSourceFingerprint === "string"
              ? det.ksyunSourceFingerprint
              : undefined;
        }
      }
    }

    const currentFp = ksyunSourceFingerprint(inputIds);
    const useCachedKsyunId =
      typeof cachedKsyunId === "number" && cachedFingerprint === currentFp
        ? cachedKsyunId
        : undefined;

    const element_input_urls = inputIds.map((idOrUrl: string) => {
      if (idOrUrl.startsWith("http") && !idOrUrl.includes("moodio.art/images/")) {
        return idOrUrl;
      }
      const cfMatch = idOrUrl.match(/\/images\/([^/?]+)/);
      if (cfMatch) {
        return getSignedImageUrl(cfMatch[1]);
      }
      return getSignedImageUrl(idOrUrl);
    });

    const out: Record<string, unknown> = {
      name,
      description,
      element_input_urls,
    };
    if (typeof el?.libraryElementId === "string") {
      out.libraryElementId = el.libraryElementId;
    }
    if (videoId) {
      // FAL Kling V3 consumes this as `video_url` on the element entry.
      out.videoUrl = getSignedVideoUrl(videoId);
    }
    if (typeof useCachedKsyunId === "number") {
      out.ksyunElementId = useCachedKsyunId;
    }
    return out;
  });
}

/**
 * Persist freshly-minted KSyun element IDs back onto the library rows that
 * sourced them. Best-effort: a write failure here is non-fatal — the next
 * submission just pays the create-and-poll cost again.
 */
export async function persistKsyunElementWriteBacks(
  writeBacks: KsyunElementWriteBack[],
  userId: string
): Promise<void> {
  if (!writeBacks || writeBacks.length === 0) return;
  await Promise.all(
    writeBacks.map(async (wb) => {
      try {
        const [row] = await db
          .select({
            details: collectionImages.elementDetails,
            id: collectionImages.id,
          })
          .from(collectionImages)
          .innerJoin(projects, eq(collectionImages.projectId, projects.id))
          .where(
            and(
              eq(collectionImages.id, wb.libraryElementId),
              eq(collectionImages.assetType, "element"),
              eq(projects.userId, userId)
            )
          )
          .limit(1);
        if (!row) return;
        const det = (row.details ?? {}) as {
          imageIds?: unknown;
          videoId?: unknown;
          voiceId?: unknown;
        };
        const imageIds = Array.isArray(det.imageIds)
          ? (det.imageIds as unknown[]).filter(
              (v): v is string => typeof v === "string"
            )
          : [];
        const videoId =
          typeof det.videoId === "string" ? det.videoId : null;
        const voiceId =
          typeof det.voiceId === "string" ? det.voiceId : null;
        await db
          .update(collectionImages)
          .set({
            elementDetails: buildElementDetails({
              imageIds,
              videoId,
              voiceId,
              ksyunElementId: wb.ksyunElementId,
              ksyunSourceFingerprint: ksyunSourceFingerprint(imageIds),
            }),
          })
          .where(eq(collectionImages.id, row.id));
      } catch (e) {
        console.error(
          `[Elements] Failed to persist ksyunElementId for library element ${wb.libraryElementId}:`,
          e
        );
      }
    })
  );
}
