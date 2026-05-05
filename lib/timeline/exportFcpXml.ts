import JSZip from "jszip";
import type { TimelineClip } from "@/components/timeline/types";
import { extractVideoIdFromUrl, getVideoProxyUrl } from "./videoProxy";

const TIMEBASE = 30;

function secondsToFrames(s: number): number {
  return Math.round(s * TIMEBASE);
}

/** FCPXML rational time string (`frames/30s`). Exact at our integer timebase. */
function toRationalTime(seconds: number): string {
  const frames = Math.round(seconds * TIMEBASE);
  return `${frames}/${TIMEBASE}s`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Collapse whitespace and truncate to 60 chars. Clip titles come from
 * generation prompts with embedded newlines, which DaVinci Resolve's
 * xmeml parser rejects inside `<name>` elements.
 */
function sanitizeName(s: string): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 60) return collapsed;
  return collapsed.slice(0, 60);
}

/** Sanitize then XML-escape. */
function safeName(s: string): string {
  return escapeXml(sanitizeName(s));
}

function slugifyProjectName(name: string): string {
  return (
    name
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase() || "moodio-export"
  );
}

/**
 * Generate an FCP7 XML (xmeml v4) representation of the timeline.
 *
 * The first `<clipitem>` referencing a given `assetId` embeds the full
 * `<file>` definition; subsequent references (including audio mirrors
 * and post-split clipitems) use `<file id="..."/>`.
 */
export function generateFcpXml(
  clips: TimelineClip[],
  projectName?: string
): string {
  const name = projectName || "Moodio Export";
  const seenFiles = new Set<string>();
  let timelinePosition = 0;

  // Per-asset hasAudio OR-aggregate: a source's <file> declares audio
  // if any clip referencing it has audio. Per-clip audio clipitems
  // are still gated on the individual clip's flag below.
  const audioByAssetId = new Map<string, boolean>();
  for (const clip of clips) {
    const has = clip.hasAudio !== false;
    audioByAssetId.set(
      clip.assetId,
      (audioByAssetId.get(clip.assetId) ?? false) || has
    );
  }

  const videoClipItems: string[] = [];
  const audioClipItems: string[] = [];

  for (const clip of clips) {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? clip.duration;
    const effectiveDuration = Math.max(0, trimEnd - trimStart);

    const startFrame = timelinePosition;
    const effectiveFrames = secondsToFrames(effectiveDuration);
    const endFrame = timelinePosition + effectiveFrames;
    const inFrame = secondsToFrames(trimStart);
    const outFrame = secondsToFrames(trimEnd);
    const sourceDurationFrames = secondsToFrames(clip.duration);

    timelinePosition = endFrame;

    const isFirstFileRef = !seenFiles.has(clip.assetId);
    seenFiles.add(clip.assetId);

    const escapedAssetId = escapeXml(clip.assetId);
    const escapedClipId = escapeXml(clip.id);
    const clipName = safeName(clip.title);

    const fileHasAudio = audioByAssetId.get(clip.assetId) ?? true;
    const audioFileMedia = fileHasAudio
      ? `
              <audio>
                <samplecharacteristics>
                  <depth>16</depth>
                  <samplerate>48000</samplerate>
                </samplecharacteristics>
              </audio>`
      : "";

    const fileElement = isFirstFileRef
      ? `<file id="${escapedAssetId}">
            <name>${clipName}</name>
            <pathurl>media/${escapedAssetId}.mp4</pathurl>
            <duration>${sourceDurationFrames}</duration>
            <rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate>
            <media>
              <video>
                <samplecharacteristics>
                  <width>1920</width>
                  <height>1080</height>
                </samplecharacteristics>
              </video>${audioFileMedia}
            </media>
          </file>`
      : `<file id="${escapedAssetId}"/>`;

    videoClipItems.push(`<clipitem id="${escapedClipId}">
        <name>${clipName}</name>
        <duration>${effectiveFrames}</duration>
        <rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${startFrame}</start>
        <end>${endFrame}</end>
        <in>${inFrame}</in>
        <out>${outFrame}</out>
        ${fileElement}
      </clipitem>`);

    // Audio clipitem mirrors the video one but always uses the id-only
    // <file> ref and adds a <sourcetrack> pointing at the source's
    // audio stream. Omitted entirely when the source has no audio.
    if (clip.hasAudio !== false) {
      audioClipItems.push(`<clipitem id="${escapedClipId}-audio">
        <name>${clipName}</name>
        <duration>${effectiveFrames}</duration>
        <rate><timebase>${TIMEBASE}</timebase><ntsc>FALSE</ntsc></rate>
        <start>${startFrame}</start>
        <end>${endFrame}</end>
        <in>${inFrame}</in>
        <out>${outFrame}</out>
        <file id="${escapedAssetId}"/>
        <sourcetrack>
          <mediatype>audio</mediatype>
          <trackindex>1</trackindex>
        </sourcetrack>
      </clipitem>`);
    }
  }

  const totalFrames = timelinePosition;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${safeName(name)}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${TIMEBASE}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <timecode>
      <rate>
        <timebase>${TIMEBASE}</timebase>
        <ntsc>FALSE</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <in>-1</in>
    <out>-1</out>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
          </samplecharacteristics>
        </format>
        <track>
          ${videoClipItems.join("\n          ")}
        </track>
      </video>${
        audioClipItems.length > 0
          ? `
      <audio>
        <track>
          ${audioClipItems.join("\n          ")}
        </track>
      </audio>`
          : ""
      }
    </media>
  </sequence>
</xmeml>`;
}

/**
 * Generate FCPXML (Final Cut Pro X native, v1.11) for the timeline.
 * Unlike FCP7 XML, assets are declared upfront in `<resources>` and
 * referenced by `rN` IDs from `<asset-clip>` elements in the spine.
 */
export function generateFcpxml(
  clips: TimelineClip[],
  projectName?: string
): string {
  const name = projectName || "Moodio Export";

  // r1 is reserved for the <format> resource, so asset IDs start at r2.
  const assetIdToRef = new Map<string, string>();
  let refCounter = 2;
  for (const clip of clips) {
    if (!assetIdToRef.has(clip.assetId)) {
      assetIdToRef.set(clip.assetId, `r${refCounter++}`);
    }
  }

  // <asset-clip>s inherit audio capability from their <asset>, so we
  // OR-aggregate hasAudio per source here.
  const audioByAssetId = new Map<string, boolean>();
  for (const clip of clips) {
    const has = clip.hasAudio !== false;
    audioByAssetId.set(
      clip.assetId,
      (audioByAssetId.get(clip.assetId) ?? false) || has
    );
  }

  const assetLines: string[] = [];
  const seenAssets = new Set<string>();
  for (const clip of clips) {
    if (seenAssets.has(clip.assetId)) continue;
    seenAssets.add(clip.assetId);
    const ref = assetIdToRef.get(clip.assetId)!;
    const dur = toRationalTime(clip.duration);
    const audioAttrs = audioByAssetId.get(clip.assetId)
      ? ` hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"`
      : "";
    assetLines.push(
      `    <asset id="${ref}" name="${safeName(
        clip.title
      )}" hasVideo="1"${audioAttrs} format="r1" duration="${dur}">
      <media-rep kind="original-media" src="media/${escapeXml(
        clip.assetId
      )}.mp4"/>
    </asset>`
    );
  }

  let timelineOffset = 0;
  const clipLines = clips.map((clip) => {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? clip.duration;
    const effectiveDuration = Math.max(0, trimEnd - trimStart);

    const offsetStr = toRationalTime(timelineOffset);
    const startStr = toRationalTime(trimStart);
    const durStr = toRationalTime(effectiveDuration);

    timelineOffset += effectiveDuration;

    const ref = assetIdToRef.get(clip.assetId)!;
    return `          <asset-clip ref="${ref}" name="${safeName(
      clip.title
    )}" offset="${offsetStr}" start="${startStr}" duration="${durStr}"/>`;
  });

  const totalDuration = toRationalTime(timelineOffset);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="1/${TIMEBASE}s" width="1920" height="1080"/>
${assetLines.join("\n")}
  </resources>
  <event name="${safeName(name)}">
    <project name="${safeName(name)}">
      <sequence format="r1" tcStart="0s" tcFormat="NDF" duration="${totalDuration}">
        <spine>
${clipLines.join("\n")}
        </spine>
      </sequence>
    </project>
  </event>
</fcpxml>`;
}

interface UniqueAssetEntry {
  assetId: string;
  videoId: string;
}

async function fetchUniqueAssets(
  clips: TimelineClip[],
  zip: JSZip,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  // Dedup by assetId; skipped entries still count toward progress so
  // the callback can drive a deterministic progress bar.
  const seen = new Set<string>();
  const entries: UniqueAssetEntry[] = [];
  const skipped: string[] = [];
  for (const clip of clips) {
    if (seen.has(clip.assetId)) continue;
    seen.add(clip.assetId);
    const videoId = extractVideoIdFromUrl(clip.videoUrl);
    if (!videoId) {
      skipped.push(clip.assetId);
      continue;
    }
    entries.push({ assetId: clip.assetId, videoId });
  }

  const mediaFolder = zip.folder("media");
  if (!mediaFolder) return;

  let done = 0;
  const total = entries.length + skipped.length;
  onProgress?.(done, total);

  for (const assetId of skipped) {
    console.warn(
      `[exportFcpXml] Skipping media for ${assetId}: no videoUrl available`
    );
    done++;
    onProgress?.(done, total);
  }

  const CONCURRENCY = 4;
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < entries.length) {
      const { assetId, videoId } = entries[idx++];
      try {
        const res = await fetch(getVideoProxyUrl(videoId));
        if (res.ok) {
          const blob = await res.blob();
          // Zip entry must be keyed on assetId to match `media/{assetId}.mp4`
          // in the generated XML (the proxy is fetched by storage videoId).
          mediaFolder.file(`${assetId}.mp4`, blob);
        } else {
          console.warn(
            `[exportFcpXml] Failed to download ${videoId}: HTTP ${res.status}`
          );
        }
      } catch (err) {
        console.warn(`[exportFcpXml] Failed to download ${videoId}:`, err);
      }
      done++;
      onProgress?.(done, total);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, entries.length) },
    () => worker()
  );
  await Promise.all(workers);
}

/**
 * Zip a project XML (`.xml` or `.fcpxml`) with its source media and
 * trigger a browser download. Media flows through the video proxy to
 * sidestep CORS on the CDN.
 *
 * @param extension Leading-dot extension, e.g. `".xml"` or `".fcpxml"`.
 */
export async function downloadProjectBundle(
  xml: string,
  extension: string,
  clips: TimelineClip[],
  projectName?: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (clips.length === 0) throw new Error("Timeline is empty");

  const slug = slugifyProjectName(projectName || "moodio-export");

  const zip = new JSZip();
  zip.file(`${slug}${extension}`, xml);

  await fetchUniqueAssets(clips, zip, onProgress);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
