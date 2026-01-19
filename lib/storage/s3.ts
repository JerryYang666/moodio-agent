import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import { Message } from "@/lib/llm/types";
import { randomUUID } from "crypto";
import { siteConfig } from "@/config/site";

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

export interface ChatHistory {
  messages: Message[];
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

  return imageId;
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
 * Strip imageUrl from message content parts before saving
 * imageUrl contains CloudFront URLs which are derived and should not be persisted
 */
function stripImageUrls(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message;
    }

    const strippedContent = message.content.map((part) => {
      if (part.type === "image" && "imageUrl" in part) {
        const { imageUrl, ...rest } = part;
        return rest;
      }
      if (part.type === "agent_image" && "imageUrl" in part) {
        const { imageUrl, ...rest } = part;
        return rest;
      }
      return part;
    });

    return {
      ...message,
      content: strippedContent,
    };
  });
}

export async function saveChatHistory(chatId: string, messages: Message[]) {
  const key = `chats/${chatId}.json`;
  // Strip imageUrl from all messages before saving - derived URLs should not be persisted
  const cleanedMessages = stripImageUrls(messages);
  const content = JSON.stringify({ messages: cleanedMessages });

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
 * Add imageUrl to message content parts on retrieval
 * Generates CloudFront URLs for all image references
 */
function addImageUrls(messages: Message[]): Message[] {
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
      if (part.type === "agent_image" && part.imageId) {
        return {
          ...part,
          imageUrl: getImageUrl(part.imageId),
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

export async function getChatHistory(chatId: string): Promise<Message[]> {
  const key = `chats/${chatId}.json`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) {
      return [];
    }

    const str = await response.Body.transformToString();
    const data = JSON.parse(str) as ChatHistory;
    // Generate fresh CloudFront URLs for all images on retrieval
    return addImageUrls(data.messages);
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return [];
    }
    throw error;
  }
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
 * Generate a CloudFront URL for an image (access via signed cookies)
 *
 * Rule of thumb:
 * - Use cookie-based URLs when a fresh API call or user action happens
 *   ~1s before render (cookies are refreshed). Benefit: stable URLs improve
 *   browser caching.
 * - Use signed URLs when an image can appear without a near-term API call
 *   (e.g., SSE image generation updates or upload completion).
 *
 * @param imageId The image ID (stored in S3 as images/{imageId})
 * @returns CloudFront URL
 */
export function getImageUrl(imageId: string): string {
  if (!CLOUDFRONT_DOMAIN) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    // Fallback to direct S3 URL if CloudFront is not configured
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/images/${imageId}`;
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
 * @param videoId The video ID (stored in S3 as videos/{videoId})
 * @returns CloudFront URL
 */
export function getVideoUrl(videoId: string): string {
  if (!CLOUDFRONT_DOMAIN) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/videos/${videoId}`;
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

/**
 * Download a file from an external URL
 * Used for downloading video results from Fal
 * @param url The URL to download from
 * @returns Buffer containing the file data
 */
export async function downloadFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
