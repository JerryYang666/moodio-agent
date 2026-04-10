import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { Message, MessageContentPart } from "@/lib/llm/types";
import {
  PersistentAssets,
  EMPTY_PERSISTENT_ASSETS,
} from "@/lib/chat/persistent-assets-types";
import { randomUUID } from "crypto";
import { siteConfig } from "@/config/site";
import { compressImageIfNeeded } from "@/lib/image/compress";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID;
// Process private key once at module load - handle escaped newlines from env var
const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n"
);

const IS_DEV = process.env.NODE_ENV === "development";

export interface ChatHistory {
  messages: Message[];
  persistentAssets?: PersistentAssets;
}

/**
 * Upload an image to S3
 * @param file The image data as Buffer or Blob
 * @param contentType The MIME type of the image
 * @param preGeneratedId Optional pre-generated imageId (for parallel tracking)
 * @returns The imageId used for storage
 */
export async function uploadImage(
  file: Buffer | Blob,
  contentType: string,
  preGeneratedId?: string
): Promise<string> {
  const imageId = preGeneratedId || randomUUID();
  const key = `images/${imageId}`;

  let body: Buffer;
  if (file instanceof Blob) {
    body = Buffer.from(await file.arrayBuffer());
  } else {
    body = file;
  }

  const serverTargetBytes = siteConfig.upload.serverCompressThresholdMB * 1024 * 1024;
  const compressed = await compressImageIfNeeded(body, contentType, serverTargetBytes);
  body = compressed.buffer;
  contentType = compressed.contentType;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return imageId;
}

/**
 * Upload a temporary image to S3 under the temp-images/ prefix.
 * Skips server-side compression — caller is responsible for format.
 * These are intermediate artifacts (e.g. format-converted element images)
 * that don't need to be in the main images collection.
 */
export async function uploadTempImage(
  file: Buffer,
  contentType: string
): Promise<string> {
  const imageId = randomUUID();
  const key = `temp-images/${imageId}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return imageId;
}

/**
 * Generate a signed CloudFront URL for a temp image.
 */
export function getSignedTempImageUrl(
  imageId: string,
  expirationSeconds?: number
): string {
  if (
    !CLOUDFRONT_DOMAIN ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/temp-images/${imageId}`;
  }

  const url = `https://${CLOUDFRONT_DOMAIN}/temp-images/${imageId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });
}

/**
 * Generate a unique image ID for tracking purposes
 * Use this to pre-generate an ID before starting image generation
 * Then pass it to uploadImage() when the image is ready
 */
export function generateImageId(): string {
  return randomUUID();
}

/**
 * Generate a presigned URL for direct client-to-S3 upload
 * This bypasses Vercel's 4.5MB request body limit
 *
 * @param imageId The image ID to use for the upload
 * @param contentType The MIME type of the image
 * @param contentLength The size of the file in bytes (for validation)
 * @param expiresIn Expiration time in seconds (default: 5 minutes)
 * @returns Presigned PUT URL for direct upload
 */
export async function getPresignedUploadUrl(
  imageId: string,
  contentType: string,
  contentLength: number,
  expiresIn: number = 300
): Promise<string> {
  const key = `images/${imageId}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  return await getS3SignedUrl(s3Client, command, { expiresIn });
}

/**
 * Check if an image exists in S3
 * Used to verify that a client upload completed successfully
 *
 * @param imageId The image ID to check
 * @returns Object with exists boolean and optional metadata
 */
export async function checkImageExists(
  imageId: string
): Promise<{ exists: boolean; contentType?: string; contentLength?: number }> {
  const key = `images/${imageId}`;

  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return {
      exists: true,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Strip derived URL fields from message content parts before saving.
 * URLs are display/runtime fields and should always be rebuilt from IDs.
 */
function stripDerivedUrls(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message;
    }

    const strippedContent = message.content.map((part) => {
      if (part.type === "image" && "imageUrl" in part) {
        const { imageUrl, ...rest } = part;
        return rest;
      }
      if ((part.type === "agent_image" || part.type === "direct_image" || part.type === "agent_video_suggest") && "imageUrl" in part) {
        const { imageUrl, ...rest } = part;
        return rest;
      }
      if (part.type === "agent_video") {
        const { config, ...rest } = part;
        const { sourceImageUrl, ...cleanConfig } = config;
        // Normalize kling_elements: rename legacy element_input_urls -> element_input_ids,
        // and extract bare image IDs from any CloudFront URLs that may have leaked in.
        if (cleanConfig.params?.kling_elements && Array.isArray(cleanConfig.params.kling_elements)) {
          cleanConfig.params = {
            ...cleanConfig.params,
            kling_elements: cleanConfig.params.kling_elements.map(
              (el: Record<string, any>) => {
                const ids = (el.element_input_ids || el.element_input_urls || []).map(
                  (v: string) => {
                    const cfMatch = v.match(/\/images\/([^/?]+)/);
                    return cfMatch ? cfMatch[1] : v;
                  }
                );
                return {
                  name: el.name,
                  description: el.description,
                  element_input_ids: ids,
                };
              }
            ),
          };
        }
        return {
          ...rest,
          config: cleanConfig,
        };
      }
      if (part.type === "direct_video") {
        const {
          config,
          thumbnailUrl,
          videoUrl,
          signedVideoUrl,
          ...rest
        } = part;
        const { sourceImageUrl, endImageUrl, ...cleanConfig } = config;
        return {
          ...rest,
          config: cleanConfig,
        };
      }
      if (part.type === "video") {
        if (part.source === "retrieval") {
          return part;
        }
        const { videoUrl, ...rest } = part;
        return { ...rest, videoUrl: "" };
      }
      return part;
    });

    return {
      ...message,
      content: strippedContent as MessageContentPart[],
    };
  });
}

export async function saveChatHistory(
  chatId: string,
  messages: Message[],
  persistentAssets?: PersistentAssets
) {
  const key = `chats/${chatId}.json`;
  // Strip all derived URL fields before saving.
  const cleanedMessages = stripDerivedUrls(messages);
  const data: ChatHistory = { messages: cleanedMessages };
  if (persistentAssets !== undefined) {
    data.persistentAssets = persistentAssets;
  }
  const content = JSON.stringify(data);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: "application/json",
    })
  );
}

/**
 * Add derived URL fields to message content parts on retrieval.
 * All URLs are generated from stable IDs and never persisted.
 */
function addDerivedUrls(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message;
    }

    const enrichedContent = message.content.map((part) => {
      if (part.type === "image" && "imageId" in part) {
        return {
          ...part,
          imageUrl: getImageUrl(part.imageId),
        };
      }
      if ((part.type === "agent_image" || part.type === "direct_image" || part.type === "agent_video_suggest") && part.imageId) {
        return {
          ...part,
          imageUrl: getImageUrl(part.imageId),
        };
      }
      if (part.type === "agent_video") {
        const enrichedConfig = {
          ...part.config,
          sourceImageUrl: part.config.sourceImageId
            ? getImageUrl(part.config.sourceImageId)
            : undefined,
        };
        // Normalize legacy element_input_urls -> element_input_ids
        if (enrichedConfig.params?.kling_elements && Array.isArray(enrichedConfig.params.kling_elements)) {
          enrichedConfig.params = {
            ...enrichedConfig.params,
            kling_elements: enrichedConfig.params.kling_elements.map(
              (el: Record<string, any>) => ({
                name: el.name,
                description: el.description,
                element_input_ids: el.element_input_ids || el.element_input_urls || [],
              })
            ),
          };
        }
        return {
          ...part,
          config: enrichedConfig,
        };
      }
      if (part.type === "direct_video") {
        return {
          ...part,
          config: {
            ...part.config,
            sourceImageUrl: getImageUrl(part.config.sourceImageId),
            endImageUrl: part.config.endImageId
              ? getImageUrl(part.config.endImageId)
              : undefined,
          },
          thumbnailUrl: part.thumbnailImageId
            ? getImageUrl(part.thumbnailImageId)
            : undefined,
          videoUrl: part.videoId ? getVideoUrl(part.videoId) : undefined,
          signedVideoUrl: part.videoId ? getSignedVideoUrl(part.videoId) : undefined,
        };
      }
      if (part.type === "video" && "videoId" in part) {
        if (part.source === "retrieval") {
          return part;
        }
        return {
          ...part,
          videoUrl: getVideoUrl(part.videoId),
        };
      }
      return part;
    });

    return {
      ...message,
      content: enrichedContent,
    };
  });
}

export async function getChatHistory(
  chatId: string
): Promise<{ messages: Message[]; persistentAssets: PersistentAssets }> {
  const key = `chats/${chatId}.json`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) {
      return { messages: [], persistentAssets: EMPTY_PERSISTENT_ASSETS };
    }

    const str = await response.Body.transformToString();
    const data = JSON.parse(str) as ChatHistory;
    // Generate fresh derived URLs on retrieval
    return {
      messages: addDerivedUrls(data.messages),
      persistentAssets: data.persistentAssets ?? EMPTY_PERSISTENT_ASSETS,
    };
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return { messages: [], persistentAssets: EMPTY_PERSISTENT_ASSETS };
    }
    throw error;
  }
}

/**
 * Save only the persistent assets for a chat, preserving existing messages.
 */
export async function savePersistentAssets(
  chatId: string,
  assets: PersistentAssets
): Promise<void> {
  const key = `chats/${chatId}.json`;

  // Load existing chat data
  let existingMessages: Message[] = [];
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    if (response.Body) {
      const str = await response.Body.transformToString();
      const data = JSON.parse(str) as ChatHistory;
      existingMessages = data.messages || [];
    }
  } catch (error: any) {
    if (error.name !== "NoSuchKey") {
      throw error;
    }
  }

  const content = JSON.stringify({
    messages: existingMessages,
    persistentAssets: assets,
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: "application/json",
    })
  );
}

export async function downloadImage(imageId: string): Promise<Buffer | null> {
  const key = `images/${imageId}`;
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (error) {
    console.error("Error downloading image:", error);
    return null;
  }
}

/**
 * Replace an existing image in S3 with new data (e.g. after compression)
 */
export async function replaceImage(
  imageId: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const key = `images/${imageId}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Generate a CloudFront URL for an image (access via signed cookies)
 *
 * Rule of thumb:
 * - Use cookie-based URLs when a fresh API call or user action happens
 *   ~1s before render (cookies are refreshed). Benefit: stable URLs improve
 *   browser caching.
 * - Use signed URLs when an image can appear without a near-term API call
 *   (e.g., SSE image generation updates or upload completion).
 *
 * Note: In development, signed URLs are always returned since CloudFront
 * cookies cannot be set locally.
 *
 * @param imageId The image ID (stored in S3 as images/{imageId})
 * @returns CloudFront URL (signed in dev, cookie-based in production)
 */
export function getImageUrl(imageId: string): string {
  if (!CLOUDFRONT_DOMAIN) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    // Fallback to direct S3 URL if CloudFront is not configured
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/images/${imageId}`;
  }

  // In development, always use signed URLs since cookies can't be set locally
  if (IS_DEV) {
    return getSignedImageUrl(imageId);
  }

  return `https://${CLOUDFRONT_DOMAIN}/images/${imageId}`;
}

/**
 * Generate a signed CloudFront URL for an image (for external services or async UI updates)
 * See getImageUrl() for the rule of thumb.
 *
 * @param imageId The image ID (stored in S3 as images/{imageId})
 * @param expirationSeconds Optional expiration time in seconds (defaults to siteConfig)
 * @returns Signed CloudFront URL
 */
export function getSignedImageUrl(
  imageId: string,
  expirationSeconds?: number
): string {
  if (
    !CLOUDFRONT_DOMAIN ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getImageUrl(imageId);
  }

  const url = `https://${CLOUDFRONT_DOMAIN}/images/${imageId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });
}

// ============================================================================
// Video Storage Functions
// ============================================================================

/**
 * Generate a presigned URL for direct client-to-S3 video upload
 */
export async function getPresignedVideoUploadUrl(
  videoId: string,
  contentType: string,
  contentLength: number,
  expiresIn: number = 300
): Promise<string> {
  const key = `videos/${videoId}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  return await getS3SignedUrl(s3Client, command, { expiresIn });
}

/**
 * Check if a video exists in S3
 */
export async function checkVideoExists(
  videoId: string
): Promise<{ exists: boolean; contentType?: string; contentLength?: number }> {
  const key = `videos/${videoId}`;

  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return {
      exists: true,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Generate a unique video ID for tracking purposes
 */
export function generateVideoId(): string {
  return randomUUID();
}

/**
 * Upload a video to S3
 * @param file The video data as Buffer or Blob
 * @param contentType The MIME type of the video (e.g., "video/mp4")
 * @param preGeneratedId Optional pre-generated videoId
 * @returns The videoId used for storage
 */
export async function uploadVideo(
  file: Buffer | Blob,
  contentType: string,
  preGeneratedId?: string
): Promise<string> {
  const videoId = preGeneratedId || randomUUID();
  const key = `videos/${videoId}`;

  let body;
  if (file instanceof Blob) {
    body = Buffer.from(await file.arrayBuffer());
  } else {
    body = file;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return videoId;
}

/**
 * Download a video from S3
 * @param videoId The video ID (stored in S3 as videos/{videoId})
 * @returns Buffer containing the video data, or null if not found
 */
export async function downloadVideo(videoId: string): Promise<Buffer | null> {
  const key = `videos/${videoId}`;
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (error) {
    console.error("Error downloading video:", error);
    return null;
  }
}

/**
 * Generate a CloudFront URL for a video (access via signed cookies)
 * See getImageUrl() for the rule of thumb and caching benefit.
 *
 * Note: In development, signed URLs are always returned since CloudFront
 * cookies cannot be set locally.
 *
 * @param videoId The video ID (stored in S3 as videos/{videoId})
 * @returns CloudFront URL (signed in dev, cookie-based in production)
 */
export function getVideoUrl(videoId: string): string {
  if (!CLOUDFRONT_DOMAIN) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/videos/${videoId}`;
  }

  // In development, always use signed URLs since cookies can't be set locally
  if (IS_DEV) {
    return getSignedVideoUrl(videoId);
  }

  return `https://${CLOUDFRONT_DOMAIN}/videos/${videoId}`;
}

/**
 * Generate a signed CloudFront URL for a video (for external services or async UI updates)
 * See getImageUrl() for the rule of thumb.
 *
 * @param videoId The video ID (stored in S3 as videos/{videoId})
 * @param expirationSeconds Optional expiration time in seconds (defaults to siteConfig)
 * @returns Signed CloudFront URL
 */
export function getSignedVideoUrl(
  videoId: string,
  expirationSeconds?: number
): string {
  if (
    !CLOUDFRONT_DOMAIN ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getVideoUrl(videoId);
  }

  const url = `https://${CLOUDFRONT_DOMAIN}/videos/${videoId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });
}

// ============================================================================
// Audio Storage Functions
// ============================================================================

export function generateAudioId(): string {
  return randomUUID();
}

export async function uploadAudio(
  file: Buffer | Blob,
  contentType: string,
  preGeneratedId?: string
): Promise<string> {
  const audioId = preGeneratedId || randomUUID();
  const key = `audios/${audioId}`;

  let body;
  if (file instanceof Blob) {
    body = Buffer.from(await file.arrayBuffer());
  } else {
    body = file;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return audioId;
}

export async function getPresignedAudioUploadUrl(
  audioId: string,
  contentType: string,
  contentLength: number,
  expiresIn: number = 300
): Promise<string> {
  const key = `audios/${audioId}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  return await getS3SignedUrl(s3Client, command, { expiresIn });
}

export async function checkAudioExists(
  audioId: string
): Promise<{ exists: boolean; contentType?: string; contentLength?: number }> {
  const key = `audios/${audioId}`;

  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return {
      exists: true,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

export async function downloadAudio(audioId: string): Promise<Buffer | null> {
  const key = `audios/${audioId}`;
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  } catch (error) {
    console.error("Error downloading audio:", error);
    return null;
  }
}

export function getAudioUrl(audioId: string): string {
  if (!CLOUDFRONT_DOMAIN) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/audios/${audioId}`;
  }

  if (IS_DEV) {
    return getSignedAudioUrl(audioId);
  }

  return `https://${CLOUDFRONT_DOMAIN}/audios/${audioId}`;
}

export function getSignedAudioUrl(
  audioId: string,
  expirationSeconds?: number
): string {
  if (
    !CLOUDFRONT_DOMAIN ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getAudioUrl(audioId);
  }

  const url = `https://${CLOUDFRONT_DOMAIN}/audios/${audioId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });
}

// Allowed hostnames for external downloads (e.g. Fal AI media URLs)
const ALLOWED_DOWNLOAD_HOSTS = [
  "fal.media",
  "storage.googleapis.com",
  "v3.fal.media",
  "fal.ai",
  "rest.alpha.fal.ai",
  "tempfile.aiquickdraw.com",
  "file.aiquickdraw.com",
  "tempfile.redpandaai.co",
  "kieai.redpandaai.co",
];

/**
 * Validate that a URL belongs to an allowed external host.
 * Throws if the URL hostname is not in the allowlist.
 */
export function validateDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL provided for download");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed for download");
  }
  const hostname = parsed.hostname;
  const isAllowed = ALLOWED_DOWNLOAD_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith("." + allowed)
  );
  if (!isAllowed) {
    throw new Error(`Download from host '${hostname}' is not allowed`);
  }
}

/**
 * Download a file from an external URL
 * Used for downloading video results from Fal
 * @param url The URL to download from
 * @returns Buffer containing the file data
 */
export async function downloadFromUrl(url: string): Promise<Buffer> {
  validateDownloadUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
