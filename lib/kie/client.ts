import sharp from "sharp";
import { uploadTempImage, getSignedTempImageUrl } from "@/lib/storage/s3";

export const KIE_API_BASE = "https://api.kie.ai";
export const KIE_FILE_UPLOAD_BASE = "https://kieai.redpandaai.co";

export function getKieApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_API_KEY environment variable is not set");
  return key;
}

export function kieAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getKieApiKey()}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// File upload helpers — re-upload external URLs so KIE can infer file type
// ---------------------------------------------------------------------------

interface KieFileUploadResponse {
  success: boolean;
  code: number;
  msg: string;
  data: {
    fileName: string;
    filePath: string;
    downloadUrl: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: string;
  };
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/**
 * Try to determine a file extension for the given URL.
 * 1. Check the URL path for a recognisable extension.
 * 2. Fall back to a HEAD request to read Content-Type.
 * 3. Default to ".jpg" — KIE needs *some* extension.
 */
export async function inferExtension(url: string): Promise<string> {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
    if (match) {
      const ext = `.${match[1].toLowerCase()}`;
      if (Object.values(MIME_TO_EXT).includes(ext)) return ext;
    }
  } catch {}

  try {
    const head = await fetch(url, { method: "HEAD" });
    const ct = head.headers.get("content-type")?.split(";")[0]?.trim();
    if (ct && MIME_TO_EXT[ct]) return MIME_TO_EXT[ct];
  } catch (err) {
    console.warn("[KIE Upload] HEAD request failed, defaulting to .jpg", err);
  }

  return ".jpg";
}

/**
 * Upload an external URL to KIE's temp storage so the task API
 * receives a URL it can reliably resolve the file type from.
 * URLs already hosted on KIE's temp storage are passed through as-is.
 *
 * `knownExt` lets callers that have already resolved the extension
 * (e.g. via `ensureKieSupportedFormat`) skip a redundant HEAD request.
 */
export async function uploadToKie(
  url: string,
  uploadPath = "moodio/inputs",
  knownExt?: string
): Promise<string> {
  if (url.includes("redpandaai.co")) return url;

  const ext = knownExt ?? (await inferExtension(url));
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  console.log(
    `[KIE Upload] Re-uploading external image to KIE temp storage (fileName: ${fileName})`
  );

  const res = await fetch(`${KIE_FILE_UPLOAD_BASE}/api/file-url-upload`, {
    method: "POST",
    headers: kieAuthHeaders(),
    body: JSON.stringify({
      fileUrl: url,
      uploadPath,
      fileName,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KIE file upload failed (${res.status}): ${text}`);
  }

  const json: KieFileUploadResponse = await res.json();
  if (!json.success || json.code !== 200) {
    throw new Error(`KIE file upload error (${json.code}): ${json.msg}`);
  }

  console.log(
    `[KIE Upload] OK — ${json.data.mimeType}, ${json.data.fileSize} bytes → ${json.data.downloadUrl}`
  );
  return json.data.downloadUrl;
}

const KIE_BASE_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const KIE_EXTENDED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type KieFormatProfile = "default" | "extended" | "seedance2";

const KIE_FORMAT_PROFILES: Record<KieFormatProfile, Set<string>> = {
  default: KIE_BASE_IMAGE_EXTS,
  extended: KIE_EXTENDED_IMAGE_EXTS,
  seedance2: new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"]),
};

/**
 * Ensure an image URL is in a format KIE accepts.
 * Uses named format profiles to determine supported extensions.
 * Unsupported formats are converted to JPEG via sharp.
 *
 * Returns both the resolved URL and the resolved extension so callers
 * (e.g. `reuploadForKie`) can forward the extension to `uploadToKie`
 * without HEAD'ing the URL a second time. Our S3 keys have no extension,
 * so without this the same CloudFront URL is HEAD'd twice per image.
 */
export async function ensureKieSupportedFormat(
  url: string,
  { allowWebp = false, formatProfile }: { allowWebp?: boolean; formatProfile?: KieFormatProfile } = {}
): Promise<{ url: string; ext: string }> {
  const ext = await inferExtension(url);
  const profile = formatProfile ?? (allowWebp ? "extended" : "default");
  const supported = KIE_FORMAT_PROFILES[profile];
  if (supported.has(ext)) return { url, ext };

  console.log(
    `[KIE Upload] Converting ${ext} image to JPEG for KIE compatibility`
  );

  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Failed to fetch image for conversion: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const jpegBuffer = await sharp(buffer)
    .rotate()
    .jpeg({ quality: 90 })
    .keepIccProfile()
    .toBuffer();
  const imageId = await uploadTempImage(jpegBuffer, "image/jpeg");
  return { url: getSignedTempImageUrl(imageId), ext: ".jpg" };
}

/**
 * Convert + re-upload a single image URL for KIE.
 */
export async function reuploadForKie(
  url: string,
  uploadPath = "moodio/inputs",
  { allowWebp = false, formatProfile }: { allowWebp?: boolean; formatProfile?: KieFormatProfile } = {}
): Promise<string> {
  const { url: converted, ext } = await ensureKieSupportedFormat(url, { allowWebp, formatProfile });
  return uploadToKie(converted, uploadPath, ext);
}

/**
 * Convert + re-upload an array of image URLs for KIE.
 */
export async function reuploadArrayForKie(
  urls: string[],
  uploadPath = "moodio/inputs",
  { allowWebp = false, formatProfile }: { allowWebp?: boolean; formatProfile?: KieFormatProfile } = {}
): Promise<string[]> {
  const converted = await Promise.all(
    urls.map((u) => ensureKieSupportedFormat(u, { allowWebp, formatProfile }))
  );
  return Promise.all(converted.map(({ url, ext }) => uploadToKie(url, uploadPath, ext)));
}
