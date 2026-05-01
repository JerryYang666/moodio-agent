import { describe, it, expect, vi } from "vitest";
import { createRequestContext } from "@/lib/agents/agent-2/context";
import { createImageInputPreparer } from "@/lib/image/prepare-inputs";

describe("createRequestContext", () => {
  const baseSend = vi.fn();
  const makePreparer = () => createImageInputPreparer(undefined);

  it("creates a context with all defaults", () => {
    const preparer = makePreparer();
    const ctx = createRequestContext({
      userId: "user-1",
      isAdmin: false,
      imageInputPreparer: preparer,
      send: baseSend,
    });

    expect(ctx.userId).toBe("user-1");
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.requestStartTime).toBeGreaterThan(0);
    expect(ctx.imageIds).toEqual([]);
    expect(ctx.imageInputPreparer).toBe(preparer);
    expect(ctx.referenceImages).toEqual([]);
    expect(ctx.precisionEditing).toBe(false);
    expect(ctx.aspectRatioOverride).toBeUndefined();
    expect(ctx.imageSizeOverride).toBeUndefined();
    expect(ctx.imageModelId).toBeUndefined();
    expect(ctx.maxImageQuantity).toBeUndefined();
    expect(ctx.systemPromptOverride).toBeUndefined();
    expect(ctx.send).toBe(baseSend);
  });

  it("validates a valid aspect ratio", () => {
    const ctx = createRequestContext({
      userId: "user-1",
      isAdmin: false,
      aspectRatioOverride: "16:9",
      imageInputPreparer: makePreparer(),
      send: baseSend,
    });
    expect(ctx.aspectRatioOverride).toBe("16:9");
  });

  it("rejects an invalid aspect ratio", () => {
    const ctx = createRequestContext({
      userId: "user-1",
      isAdmin: false,
      aspectRatioOverride: "7:3",
      imageInputPreparer: makePreparer(),
      send: baseSend,
    });
    expect(ctx.aspectRatioOverride).toBeUndefined();
  });

  it("validates a valid image size", () => {
    const ctx = createRequestContext({
      userId: "user-1",
      isAdmin: false,
      imageSizeOverride: "4k",
      imageInputPreparer: makePreparer(),
      send: baseSend,
    });
    expect(ctx.imageSizeOverride).toBe("4k");
  });

  it("rejects an invalid image size", () => {
    const ctx = createRequestContext({
      userId: "user-1",
      isAdmin: false,
      imageSizeOverride: "8k" as any,
      imageInputPreparer: makePreparer(),
      send: baseSend,
    });
    expect(ctx.imageSizeOverride).toBeUndefined();
  });

  it("passes through all provided fields", () => {
    const preparer = makePreparer();
    const referenceImages = [{ imageId: "ref-1", tag: "style" as const }];

    const ctx = createRequestContext({
      userId: "user-2",
      isAdmin: true,
      requestStartTime: 12345,
      imageIds: ["img-1"],
      imageInputPreparer: preparer,
      referenceImages,
      precisionEditing: true,
      aspectRatioOverride: "1:1",
      imageSizeOverride: "2k",
      imageModelId: "model-x",
      maxImageQuantity: 3,
      systemPromptOverride: "custom prompt",
      send: baseSend,
    });

    expect(ctx.userId).toBe("user-2");
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.requestStartTime).toBe(12345);
    expect(ctx.imageIds).toEqual(["img-1"]);
    expect(ctx.imageInputPreparer).toBe(preparer);
    expect(ctx.referenceImages).toEqual(referenceImages);
    expect(ctx.precisionEditing).toBe(true);
    expect(ctx.aspectRatioOverride).toBe("1:1");
    expect(ctx.imageSizeOverride).toBe("2k");
    expect(ctx.imageModelId).toBe("model-x");
    expect(ctx.maxImageQuantity).toBe(3);
    expect(ctx.systemPromptOverride).toBe("custom prompt");
  });
});
