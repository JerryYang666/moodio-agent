import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Message } from "@/lib/llm/types";

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

