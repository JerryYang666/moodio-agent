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
import { getCdnDomain } from "@/lib/cdn";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;
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
  expirationSeconds?: number,
  cnMode: boolean = false
): string {
  const originDomain = getCdnDomain(false);
  if (
    !originDomain ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    const fallback = getCdnDomain(cnMode) || "s3-fallback";
    return `https://${fallback}/temp-images/${imageId}`;
  }

  const url = `https://${originDomain}/temp-images/${imageId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  const signed = getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });

  if (cnMode) {
    const cnDomain = getCdnDomain(true);
    if (cnDomain && cnDomain !== originDomain) {
      return signed.replace(originDomain, cnDomain);
    }
  }
  return signed;
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
      if (part.type === "video") {
        if (part.source === "retrieval") {
          return part;
        }
        const { videoUrl, ...rest } = part;
        return { ...rest, videoUrl: "" };
      }
      if (part.type === "audio" && "audioUrl" in part) {
        const { audioUrl, ...rest } = part;
        return rest;
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
function addDerivedUrls(messages: Message[], cnMode: boolean = false): Message[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message;
    }

    const enrichedContent = message.content.map((part) => {
      if (part.type === "image" && "imageId" in part) {
        return {
          ...part,
          imageUrl: getImageUrl(part.imageId, cnMode),
        };
      }
      if ((part.type === "agent_image" || part.type === "direct_image" || part.type === "agent_video_suggest") && part.imageId) {
        return {
          ...part,
          imageUrl: getImageUrl(part.imageId, cnMode),
        };
      }
      if (part.type === "agent_video") {
        const enrichedConfig = {
          ...part.config,
          sourceImageUrl: part.config.sourceImageId
            ? getImageUrl(part.config.sourceImageId, cnMode)
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
        const enrichedConfig: typeof part.config = {
          ...part.config,
          sourceImageUrl: getImageUrl(part.config.sourceImageId, cnMode),
          endImageUrl: part.config.endImageId
            ? getImageUrl(part.config.endImageId, cnMode)
            : undefined,
        };
        // Normalize legacy element_input_urls -> element_input_ids (defensive
        // recovery in case earlier persistence leaked signed URLs into history).
        if (enrichedConfig.params?.kling_elements && Array.isArray(enrichedConfig.params.kling_elements)) {
          enrichedConfig.params = {
            ...enrichedConfig.params,
            kling_elements: enrichedConfig.params.kling_elements.map(
              (el: Record<string, any>) => {
                const ids = (el.element_input_ids || el.element_input_urls || []).map(
                  (v: string) => {
                    const cfMatch = typeof v === "string" ? v.match(/\/images\/([^/?]+)/) : null;
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
          ...part,
          config: enrichedConfig,
          thumbnailUrl: part.thumbnailImageId
            ? getImageUrl(part.thumbnailImageId, cnMode)
            : undefined,
          videoUrl: part.videoId ? getVideoUrl(part.videoId, cnMode) : undefined,
          signedVideoUrl: part.videoId ? getSignedVideoUrl(part.videoId, undefined, cnMode) : undefined,
        };
      }
      if (part.type === "video" && "videoId" in part) {
        if (part.source === "retrieval") {
          return part;
        }
        return {
          ...part,
          videoUrl: getVideoUrl(part.videoId, cnMode),
        };
      }
      if (part.type === "audio" && "audioId" in part) {
        return {
          ...part,
          audioUrl: getAudioUrl(part.audioId, cnMode),
        };
      }
      if (part.type === "media_references") {
        return {
          ...part,
          references: part.references.map((ref) => ({
            ...ref,
            url:
              ref.refType === "video"
                ? getVideoUrl(ref.id, cnMode)
                : ref.refType === "audio"
                  ? getAudioUrl(ref.id, cnMode)
                  : getImageUrl(ref.id, cnMode),
          })),
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
  chatId: string,
  cnMode: boolean = false
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
      messages: addDerivedUrls(data.messages, cnMode),
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
export function getImageUrl(imageId: string, cnMode: boolean = false): string {
  const domain = getCdnDomain(cnMode);
  if (!domain) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${domain || "s3-fallback"}/images/${imageId}`;
  }

  if (IS_DEV) {
    return getSignedImageUrl(imageId, undefined, cnMode);
  }

  return `https://${domain}/images/${imageId}`;
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
  expirationSeconds?: number,
  cnMode: boolean = false
): string {
  const originDomain = getCdnDomain(false);
  if (
    !originDomain ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getImageUrl(imageId, cnMode);
  }

  // Sign against the original CloudFront domain (CN CDN is a reverse proxy)
  const url = `https://${originDomain}/images/${imageId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  const signed = getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });

  if (cnMode) {
    const cnDomain = getCdnDomain(true);
    if (cnDomain && cnDomain !== originDomain) {
      return signed.replace(originDomain, cnDomain);
    }
  }
  return signed;
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
export function getVideoUrl(videoId: string, cnMode: boolean = false): string {
  const domain = getCdnDomain(cnMode);
  if (!domain) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${domain || "s3-fallback"}/videos/${videoId}`;
  }

  if (IS_DEV) {
    return getSignedVideoUrl(videoId, undefined, cnMode);
  }

  return `https://${domain}/videos/${videoId}`;
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
  expirationSeconds?: number,
  cnMode: boolean = false
): string {
  const originDomain = getCdnDomain(false);
  if (
    !originDomain ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getVideoUrl(videoId, cnMode);
  }

  // Sign against the original CloudFront domain (CN CDN is a reverse proxy)
  const url = `https://${originDomain}/videos/${videoId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  const signed = getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });

  if (cnMode) {
    const cnDomain = getCdnDomain(true);
    if (cnDomain && cnDomain !== originDomain) {
      return signed.replace(originDomain, cnDomain);
    }
  }
  return signed;
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

export function getAudioUrl(audioId: string, cnMode: boolean = false): string {
  const domain = getCdnDomain(cnMode);
  if (!domain) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${domain || "s3-fallback"}/audios/${audioId}`;
  }

  if (IS_DEV) {
    return getSignedAudioUrl(audioId, undefined, cnMode);
  }

  return `https://${domain}/audios/${audioId}`;
}

export function getSignedAudioUrl(
  audioId: string,
  expirationSeconds?: number,
  cnMode: boolean = false
): string {
  const originDomain = getCdnDomain(false);
  if (
    !originDomain ||
    !CLOUDFRONT_KEY_PAIR_ID ||
    !CLOUDFRONT_PRIVATE_KEY
  ) {
    console.warn(
      "[CloudFront] Missing CloudFront signing configuration, falling back to unsigned URL"
    );
    return getAudioUrl(audioId, cnMode);
  }

  // Sign against the original CloudFront domain (CN CDN is a reverse proxy)
  const url = `https://${originDomain}/audios/${audioId}`;
  const expiration =
    expirationSeconds || siteConfig.cloudfront.signedUrlExpirationSeconds;
  const dateLessThan = new Date(Date.now() + expiration * 1000);

  const signed = getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: CLOUDFRONT_PRIVATE_KEY,
  });

  if (cnMode) {
    const cnDomain = getCdnDomain(true);
    if (cnDomain && cnDomain !== originDomain) {
      return signed.replace(originDomain, cnDomain);
    }
  }
  return signed;
}

// ============================================================================
// Generic Media Helpers (for bulk / direct download)
// ============================================================================

const MEDIA_PREFIX: Record<"image" | "video" | "audio", string> = {
  image: "images",
  video: "videos",
  audio: "audios",
};

/**
 * Lightweight HEAD request to get the ContentType stored in S3 metadata.
 * Returns null when the object does not exist or the call fails.
 */
export async function getMediaContentType(
  type: "image" | "video" | "audio",
  id: string
): Promise<string | null> {
  const key = `${MEDIA_PREFIX[type]}/${id}`;
  try {
    const response = await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    return response.ContentType || null;
  } catch {
    return null;
  }
}

/**
 * Generate a CloudFront signed download URL for any media type.
 * Delegates to getSignedImageUrl / getSignedVideoUrl / getSignedAudioUrl.
 */
export function getSignedDownloadUrl(
  type: "image" | "video" | "audio",
  id: string,
  cnMode: boolean = false,
  expirationSeconds?: number
): string {
  switch (type) {
    case "image":
      return getSignedImageUrl(id, expirationSeconds, cnMode);
    case "video":
      return getSignedVideoUrl(id, expirationSeconds, cnMode);
    case "audio":
      return getSignedAudioUrl(id, expirationSeconds, cnMode);
  }
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
  "volces.com",
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

// Retryable fetch errors (network-level, transient).
// undici surfaces these as error.cause.code on TypeError: fetch failed.
const RETRYABLE_FETCH_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

function isRetryableFetchError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    if (err.message === "fetch failed") return true;
    const cause = (err as { cause?: { code?: string; name?: string } }).cause;
    if (cause?.code && RETRYABLE_FETCH_ERROR_CODES.has(cause.code)) return true;
    if (cause?.name === "AbortError" || cause?.name === "TimeoutError") {
      return true;
    }
  }
  return false;
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * fetch() with retry + per-attempt timeout for transient network errors.
 * Exponential backoff with jitter. Used by download helpers that pull large
 * media from third-party hosts (Fal, Kie, Volcengine TOS in China, etc.),
 * where a single connect timeout would otherwise cause us to drop a
 * successful generation and refund the user.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: {
    maxAttempts?: number;
    timeoutMs?: number;
    baseBackoffMs?: number;
    logPrefix?: string;
  } = {}
): Promise<Response> {
  const {
    maxAttempts = 4,
    timeoutMs = 60_000,
    baseBackoffMs = 1_000,
    logPrefix = "[fetchWithRetry]",
  } = opts;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const signal = init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      const response = await fetch(url, { ...init, signal });

      if (!response.ok && isRetryableHttpStatus(response.status)) {
        if (attempt === maxAttempts) return response;
        lastError = new Error(
          `HTTP ${response.status} ${response.statusText}`
        );
        console.warn(
          `${logPrefix} attempt ${attempt}/${maxAttempts} got ${response.status} ${response.statusText}, retrying…`
        );
      } else {
        if (attempt > 1) {
          console.log(
            `${logPrefix} succeeded on attempt ${attempt}/${maxAttempts}`
          );
        }
        return response;
      }
    } catch (err) {
      lastError = err;
      const retryable = isRetryableFetchError(err);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      const causeCode =
        err instanceof Error
          ? (err as { cause?: { code?: string } }).cause?.code
          : undefined;
      console.warn(
        `${logPrefix} attempt ${attempt}/${maxAttempts} failed (${
          causeCode || (err instanceof Error ? err.message : "unknown")
        }), retrying…`
      );
    }

    const backoff =
      baseBackoffMs * Math.pow(2, attempt - 1) +
      Math.floor(Math.random() * 500) -
      250;
    await new Promise((r) => setTimeout(r, Math.max(0, backoff)));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("fetchWithRetry exhausted all attempts");
}

/**
 * Download a file from an external URL
 * Used for downloading video / image results from third-party providers.
 *
 * Retries on transient failures (connect timeout, socket errors, 5xx, 429)
 * with exponential backoff. This matters a lot for Volcengine TOS and other
 * cross-region hosts where a single connect timeout would otherwise cause us
 * to refund a successful generation.
 *
 * @param url The URL to download from
 * @returns Buffer containing the file data
 */
export async function downloadFromUrl(url: string): Promise<Buffer> {
  validateDownloadUrl(url);

  const response = await fetchWithRetry(
    url,
    {},
    { logPrefix: "[downloadFromUrl]" }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to download from URL: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
