import { Message, MessageContentPart } from "@/lib/llm/types";
import { PendingImage } from "./pending-image-types";

/**
 * Extracts images from a user message's content.
 * User messages can have images in two formats:
 * 1. { type: "image_url", image_url: { url: string } } - for display
 * 2. { type: "image", imageId: string, imageUrl?: string, source?: string } - with metadata
 */
export function extractImagesFromUserMessage(message: Message): PendingImage[] {
  if (message.role !== "user") return [];
  
  const content = message.content;
  if (typeof content === "string") return [];
  
  const images: PendingImage[] = [];
  
  for (const part of content) {
    if (part.type === "image" && part.imageId) {
      // This is the structured image format with metadata
      images.push({
        imageId: part.imageId,
        url: part.imageUrl || "",
        source: part.source || "upload",
        title: part.title, // Now includes title from stored message
      });
    } else if (part.type === "image_url" && part.image_url?.url) {
      // This is the display format - we need to extract imageId from URL if possible
      // CloudFront URLs typically have the imageId in the path
      const url = part.image_url.url;
      const imageId = extractImageIdFromUrl(url);
      if (imageId) {
        images.push({
          imageId,
          url,
          source: "upload", // Default to upload for image_url type
          title: undefined,
        });
      }
    }
  }
  
  return images;
}

/**
 * Extracts imageId from a CloudFront URL.
 * URLs are typically in format: https://xxx.cloudfront.net/{imageId}.{ext}
 */
function extractImageIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    // Remove leading slash and extension
    const filename = pathname.split("/").pop();
    if (!filename) return null;
    // Remove extension
    const imageId = filename.replace(/\.[^.]+$/, "");
    return imageId || null;
  } catch {
    return null;
  }
}

/**
 * Finds the last user message that contains images.
 * Traverses messages from the end to find the most recent one.
 */
export function findLastUserMessageWithImages(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") {
      const images = extractImagesFromUserMessage(message);
      if (images.length > 0) {
        return message;
      }
    }
  }
  return null;
}

/**
 * Gets pre-selected images from the last user message with images.
 * This is used to automatically populate the pending images area
 * after page load or after an AI response completes.
 */
export function getPreselectImages(messages: Message[]): PendingImage[] {
  const lastUserMessageWithImages = findLastUserMessageWithImages(messages);
  if (!lastUserMessageWithImages) return [];
  
  return extractImagesFromUserMessage(lastUserMessageWithImages);
}
