import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  getActiveAccount,
  assertSufficientCredits,
  deductCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { getUserSetting } from "@/lib/user-settings/server";
import { editImageWithModel } from "@/lib/image/service";
import { DEFAULT_IMAGE_MODEL_ID, getImageModel } from "@/lib/image/models";
import { createImageInputPreparer } from "@/lib/image/prepare-inputs";
import {
  calculateCost,
  parseImageSizeToNumber,
  parseImageQualityToNumber,
} from "@/lib/pricing";
import { uploadImage, getSignedImageUrl } from "@/lib/storage/s3";
import sharp from "sharp";

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function inferAspectRatio(width: number, height: number): string {
  const d = gcd(width, height);
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

export type ImageEditOperation =
  | "redraw"
  | "erase"
  | "cutout-auto"
  | "cutout-manual";

const VALID_MARK_COLORS = ["red", "blue", "green", "yellow", "magenta"] as const;
type MarkColorName = (typeof VALID_MARK_COLORS)[number];

const buildErasePrompt = (color: MarkColorName) =>
  `Remove the content marked in semi-transparent ${color} from this image and naturally fill the area to seamlessly match the surrounding context. The ${color} marking is a translucent overlay drawn by the user — preserve everything outside it and do not leave any ${color} tint in the output.`;

const CUTOUT_AUTO_PROMPT =
  "Extract the main subject of this image and remove the background. Return a PNG with a fully transparent background showing only the main subject.";

const buildCutoutManualPrompt = (color: MarkColorName) =>
  `Extract only the content marked in semi-transparent ${color} in this image and remove everything else. The ${color} marking is a translucent overlay drawn by the user — return a PNG with a fully transparent background showing only the content that was beneath the ${color} marking, with no ${color} tint left over.`;

const buildRedrawPrompt = (userPrompt: string, color: MarkColorName) =>
  `${userPrompt}\n\n(The area to change is indicated by a semi-transparent ${color} marking on the input image. The marking is a translucent overlay drawn by the user — the original content underneath is still visible to you and should inform style, lighting, and composition. Apply the change only inside the marked area, preserve everything outside, and do not leave any ${color} tint in the output.)`;

/**
 * POST /api/image/edit
 *
 * Standalone image-edit endpoint used by the in-canvas image-edit overlay on
 * the Infinite desktop. Mirrors the editing path inside the chat message
 * route but doesn't create a chat message — it just runs the model, uploads
 * the result, and returns the new imageId so the caller can swap it onto
 * the canvas asset (with history) through the desktop's undo/redo engine.
 *
 * Body shape:
 *   {
 *     operation: "redraw" | "erase" | "cutout-auto" | "cutout-manual",
 *     sourceImageId: string,                 // the image as it currently is on the canvas
 *     markedImageId?: string,                // user's red-marked version, REQUIRED for redraw / erase / cutout-manual
 *     prompt?: string,                       // REQUIRED for redraw, ignored for the others
 *     modelId?: string,                      // defaults to nano-banana-2
 *     imageSize?: "1k" | "2k" | "4k",
 *     imageQuality?: "auto" | "low" | "medium" | "high",
 *   }
 *
 * Response: { imageId: string, imageUrl: string }
 */
export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const account = await getActiveAccount(payload.userId, payload);
    const cnMode = await getUserSetting(payload.userId, "cnMode");

    const body = await req.json();
    const operation = body.operation as ImageEditOperation | undefined;
    const sourceImageId =
      typeof body.sourceImageId === "string" ? body.sourceImageId : "";
    const markedImageId =
      typeof body.markedImageId === "string" && body.markedImageId
        ? body.markedImageId
        : undefined;
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId
        ? body.modelId
        : DEFAULT_IMAGE_MODEL_ID;
    const imageSize: "1k" | "2k" | "4k" =
      body.imageSize === "1k" || body.imageSize === "4k"
        ? body.imageSize
        : "2k";
    const imageQuality: "auto" | "low" | "medium" | "high" =
      body.imageQuality === "low" ||
      body.imageQuality === "medium" ||
      body.imageQuality === "high"
        ? body.imageQuality
        : "auto";
    const markColor: MarkColorName = VALID_MARK_COLORS.includes(body.markColor)
      ? (body.markColor as MarkColorName)
      : "red";

    if (
      operation !== "redraw" &&
      operation !== "erase" &&
      operation !== "cutout-auto" &&
      operation !== "cutout-manual"
    ) {
      return NextResponse.json(
        { error: "Invalid or missing operation" },
        { status: 400 }
      );
    }
    if (!sourceImageId) {
      return NextResponse.json(
        { error: "sourceImageId is required" },
        { status: 400 }
      );
    }

    // Pick the input image and prompt based on operation. Marked operations
    // bake the user's red drawing into the input image (matching the existing
    // chat mark-to-edit pipeline) so providers don't need a separate mask.
    let inputImageId: string;
    let prompt: string;
    if (operation === "redraw") {
      if (!markedImageId) {
        return NextResponse.json(
          { error: "markedImageId is required for redraw" },
          { status: 400 }
        );
      }
      if (!userPrompt) {
        return NextResponse.json(
          { error: "prompt is required for redraw" },
          { status: 400 }
        );
      }
      inputImageId = markedImageId;
      prompt = buildRedrawPrompt(userPrompt, markColor);
    } else if (operation === "erase") {
      if (!markedImageId) {
        return NextResponse.json(
          { error: "markedImageId is required for erase" },
          { status: 400 }
        );
      }
      inputImageId = markedImageId;
      prompt = buildErasePrompt(markColor);
    } else if (operation === "cutout-manual") {
      if (!markedImageId) {
        return NextResponse.json(
          { error: "markedImageId is required for cutout-manual" },
          { status: 400 }
        );
      }
      inputImageId = markedImageId;
      prompt = buildCutoutManualPrompt(markColor);
    } else {
      // cutout-auto: no user marking, so markColor doesn't apply.
      inputImageId = sourceImageId;
      prompt = CUTOUT_AUTO_PROMPT;
    }

    // Cost / credits.
    const resolution = parseImageSizeToNumber(imageSize);
    const quality = parseImageQualityToNumber(imageQuality);
    const cost = await calculateCost(modelId || "Image/all", {
      resolution,
      quality,
    });
    if (cost > 0) {
      await assertSufficientCredits(account.accountId, cost, account.accountType);
    }

    // Provider-specific input prep (base64 / KIE re-upload / signed URLs).
    const provider = getImageModel(modelId)?.provider;
    const preparer = createImageInputPreparer(provider);
    const prepared = await preparer.prepareEditInputs([inputImageId]);

    // Preserve the original framing for model-based edits by inferring the
    // source image aspect ratio and passing it through provider adapters.
    // Without this, providers may default to square/canonical ratios.
    let inferredAspectRatio: string | undefined;
    try {
      const sourceForRatio = prepared.imageBase64?.[0]
        ? Buffer.from(prepared.imageBase64[0], "base64")
        : undefined;
      if (sourceForRatio) {
        const meta = await sharp(sourceForRatio).metadata();
        if (meta.width && meta.height && meta.width > 0 && meta.height > 0) {
          inferredAspectRatio = inferAspectRatio(meta.width, meta.height);
        }
      }
    } catch (ratioErr) {
      console.warn("[image/edit] failed to infer aspect ratio:", ratioErr);
    }

    let result;
    try {
      result = await editImageWithModel(modelId, {
        prompt,
        imageIds: [inputImageId],
        imageBase64: prepared.imageBase64,
        imageInputUrls: prepared.imageInputUrls,
        aspectRatio: inferredAspectRatio,
        userAspectRatio: inferredAspectRatio,
        imageSize,
        quality: imageQuality,
      });
    } catch (err) {
      console.error("[image/edit] model call failed:", err);
      const message = err instanceof Error ? err.message : "Edit failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const newImageId = await uploadImage(result.imageBuffer, result.contentType);

    if (cost > 0) {
      try {
        await deductCredits(
          account.accountId,
          cost,
          "image_generation",
          `Desktop image edit (${operation}, ${modelId})`,
          account.performedBy,
          { type: "desktop_image_edit", id: sourceImageId },
          account.accountType
        );
      } catch (err) {
        // The image is already uploaded; surface the credit failure but the
        // client can still use the returned imageId. We log and keep going.
        console.error("[image/edit] credit deduction failed:", err);
      }
    }

    return NextResponse.json({
      imageId: newImageId,
      imageUrl: getSignedImageUrl(newImageId, undefined, cnMode),
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "INSUFFICIENT_CREDITS" },
        { status: 402 }
      );
    }
    console.error("[image/edit] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
