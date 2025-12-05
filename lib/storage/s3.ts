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

export async function uploadImage(
  file: Buffer | Blob,
  contentType: string
): Promise<string> {
  const imageId = randomUUID();
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

export async function saveChatHistory(chatId: string, messages: Message[]) {
  const key = `chats/${chatId}.json`;
  const content = JSON.stringify({ messages });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: "application/json",
    })
  );
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
    return data.messages;
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
 * Generate a signed CloudFront URL for an image
 * @param imageId The image ID (stored in S3 as images/{imageId})
 * @param expirationSeconds Optional expiration time in seconds (defaults to siteConfig)
 * @returns Signed CloudFront URL
 */
export function getSignedImageUrl(
  imageId: string,
  expirationSeconds?: number
): string {
  if (!CLOUDFRONT_DOMAIN || !CLOUDFRONT_KEY_PAIR_ID || !CLOUDFRONT_PRIVATE_KEY) {
    console.warn(
      "[CloudFront] Missing CloudFront configuration, falling back to unsigned URL"
    );
    // Fallback to direct S3 URL if CloudFront is not configured
    return `https://${CLOUDFRONT_DOMAIN || "s3-fallback"}/images/${imageId}`;
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
