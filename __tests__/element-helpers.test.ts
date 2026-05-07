import { describe, it, expect } from "vitest";
import {
  buildElementDetails,
  ksyunSourceFingerprint,
} from "@/lib/elements/helpers";

describe("ksyunSourceFingerprint", () => {
  it("is stable for the same input", () => {
    const a = ksyunSourceFingerprint(["img_a", "img_b"]);
    const b = ksyunSourceFingerprint(["img_a", "img_b"]);
    expect(a).toBe(b);
  });

  it("changes when image ids change", () => {
    expect(ksyunSourceFingerprint(["a", "b"])).not.toBe(
      ksyunSourceFingerprint(["a", "c"])
    );
  });

  it("changes when image order changes (positional element semantics)", () => {
    expect(ksyunSourceFingerprint(["a", "b"])).not.toBe(
      ksyunSourceFingerprint(["b", "a"])
    );
  });
});

describe("buildElementDetails", () => {
  it("omits optional fields when not provided", () => {
    const out = buildElementDetails({ imageIds: ["a"] });
    expect(out).toEqual({ imageIds: ["a"] });
  });

  it("stores voice id with the fal provider tag", () => {
    const out = buildElementDetails({
      imageIds: ["a"],
      voiceId: "voice_1",
    }) as Record<string, unknown>;
    expect(out.voiceId).toBe("voice_1");
    expect(out.voiceProvider).toBe("fal");
  });

  it("stores ksyunElementId with a fingerprint matching the saved imageIds", () => {
    const out = buildElementDetails({
      imageIds: ["a", "b"],
      ksyunElementId: 42,
    }) as Record<string, unknown>;
    expect(out.ksyunElementId).toBe(42);
    expect(out.ksyunSourceFingerprint).toBe(
      ksyunSourceFingerprint(["a", "b"])
    );
  });

  it("uses the caller-supplied fingerprint when one is given", () => {
    const out = buildElementDetails({
      imageIds: ["a", "b"],
      ksyunElementId: 42,
      ksyunSourceFingerprint: "explicit-fp",
    }) as Record<string, unknown>;
    expect(out.ksyunSourceFingerprint).toBe("explicit-fp");
  });

  it("does not store fingerprint when no ksyunElementId is set", () => {
    const out = buildElementDetails({
      imageIds: ["a", "b"],
    }) as Record<string, unknown>;
    expect(out.ksyunSourceFingerprint).toBeUndefined();
  });
});
