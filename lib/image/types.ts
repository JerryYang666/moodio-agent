export type ImageOperation = "generate" | "edit";
export type ImageSize = "1k" | "2k" | "4k";
export type ImageQuality = "auto" | "low" | "medium" | "high";

export interface ImageGenerationInput {
  prompt: string;
  /**
   * The effective aspect ratio: user pick > agent suggestion > "1:1".
   * Always set. Used by providers that require a concrete ratio
   * (google / fal / kie). gpt-image-2 ignores this — it reads `userAspectRatio`.
   */
  aspectRatio?: string;
  /**
   * The aspect ratio the user explicitly picked (e.g. "3:4"). Undefined when
   * the user is on "smart" mode — in which case gpt-image-2 gets `size=auto`
   * and infers from the reference image / prompt. Without this distinction
   * we can't tell "user picked 1:1" from "user picked smart and agent guessed 1:1".
   */
  userAspectRatio?: string;
  imageSize?: ImageSize;
  quality?: ImageQuality;
}

export interface ImageEditInput {
  prompt: string;
  imageIds?: string[];
  imageBase64?: string[];
  /**
   * Provider-prepared input URLs the caller has already ingested into the
   * provider's storage. KIE consumes these directly as `image_input`,
   * skipping its own per-call re-upload. Other providers ignore this.
   * The caller is responsible for ensuring they're aligned with `imageIds`
   * and produced through the right helper (e.g. `reuploadArrayForKie`).
   */
  imageInputUrls?: string[];
  /** See ImageGenerationInput.aspectRatio. */
  aspectRatio?: string;
  /** See ImageGenerationInput.userAspectRatio. */
  userAspectRatio?: string;
  imageSize?: ImageSize;
  quality?: ImageQuality;
}

export interface ImageProviderResult {
  imageBuffer: Buffer;
  contentType: string;
  provider: "google" | "fal" | "kie" | "openai";
  providerModelId: string;
  response?: any;
}

export interface ImageResult extends ImageProviderResult {
  modelId: string;
}
