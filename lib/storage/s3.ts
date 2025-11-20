import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Message } from "@/lib/llm/types";
import { randomUUID } from "crypto";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

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
      ACL: "public-read",
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
