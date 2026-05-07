import { describe, it, expect } from "vitest";
import {
  applyElementToSeedanceReference,
  applyElementToKlingElements,
} from "@/lib/adapters/element-adapters";
import type { ElementAsset, KlingElement } from "@/lib/video/models";

function makeElement(overrides: Partial<ElementAsset> = {}): ElementAsset {
  return {
    id: "el_1",
    name: "Hero",
    description: "A confident hero in a red cape",
    imageIds: [],
    ...overrides,
  };
}

describe("applyElementToSeedanceReference", () => {
  it("maps the first 2 images + video + voice to media refs", () => {
    const el = makeElement({
      imageIds: ["img_a", "img_b", "img_c", "img_d"],
      videoId: "vid_x",
      voiceId: "voice_1",
    });
    const { appendReferences, promptAppend } =
      applyElementToSeedanceReference(el);
    expect(appendReferences).toEqual([
      { type: "image", id: "img_a" },
      { type: "image", id: "img_b" },
      { type: "video", id: "vid_x" },
      { type: "audio", id: "voice_1" },
    ]);
    expect(promptAppend).toBe("Hero\nA confident hero in a red cape");
  });

  it("skips video and audio when absent", () => {
    const el = makeElement({ imageIds: ["img_a"] });
    const { appendReferences, promptAppend } =
      applyElementToSeedanceReference(el);
    expect(appendReferences).toEqual([{ type: "image", id: "img_a" }]);
    expect(promptAppend).toBe("Hero\nA confident hero in a red cape");
  });

  it("emits no image references when imageIds is empty", () => {
    const el = makeElement({
      imageIds: [],
      videoId: "vid_x",
    });
    const { appendReferences } = applyElementToSeedanceReference(el);
    expect(appendReferences).toEqual([{ type: "video", id: "vid_x" }]);
  });

  it("falls back to name or description alone when one is empty", () => {
    expect(
      applyElementToSeedanceReference(
        makeElement({ name: "Hero", description: "" })
      ).promptAppend
    ).toBe("Hero");
    expect(
      applyElementToSeedanceReference(
        makeElement({ name: "", description: "Just a description" })
      ).promptAppend
    ).toBe("Just a description");
    expect(
      applyElementToSeedanceReference(
        makeElement({ name: "", description: "" })
      ).promptAppend
    ).toBe("");
  });

  it("trims whitespace around name and description", () => {
    const el = makeElement({ name: "  Hero  ", description: "  Caped  " });
    expect(applyElementToSeedanceReference(el).promptAppend).toBe(
      "Hero\nCaped"
    );
  });

  it("caps image references at 2 even when the element has 4", () => {
    const el = makeElement({
      imageIds: ["a", "b", "c", "d"],
    });
    const { appendReferences } = applyElementToSeedanceReference(el);
    const imageRefs = appendReferences.filter((r) => r.type === "image");
    expect(imageRefs).toHaveLength(2);
    expect(imageRefs.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("applyElementToKlingElements", () => {
  const current: KlingElement[] = [
    { name: "Existing", description: "desc", element_input_ids: ["x", "y"] },
  ];

  it("appends a new kling element from up to 4 imageIds", () => {
    const el = makeElement({
      imageIds: ["img_a", "img_b", "img_c", "img_d"],
    });
    const { next, error } = applyElementToKlingElements(el, current);
    expect(error).toBeUndefined();
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({
      name: "Hero",
      description: "A confident hero in a red cape",
      element_input_ids: ["img_a", "img_b", "img_c", "img_d"],
      libraryElementId: "el_1",
    });
  });

  it("truncates imageIds beyond 4", () => {
    const el = makeElement({
      imageIds: ["a", "b", "c", "d", "e", "f"],
    });
    const { next } = applyElementToKlingElements(el, []);
    expect(next[0].element_input_ids).toEqual(["a", "b", "c", "d"]);
  });

  it("carries videoId on the entry (FAL V3 maps it to video_url) and drops voiceId", () => {
    const el = makeElement({
      imageIds: ["a", "b"],
      videoId: "vid_x",
      voiceId: "voice_1",
    });
    const { next } = applyElementToKlingElements(el, []);
    const appended = next[0] as KlingElement & {
      videoId?: string;
      voiceId?: string;
    };
    expect(appended.element_input_ids).toEqual(["a", "b"]);
    expect(appended.videoId).toBe("vid_x");
    expect(appended.voiceId).toBeUndefined();
  });

  it("carries cached ksyunElementId on the entry when present", () => {
    const el = makeElement({
      imageIds: ["a", "b"],
      ksyunElementId: 12345,
    });
    const { next } = applyElementToKlingElements(el, []);
    const appended = next[0] as KlingElement & { ksyunElementId?: number };
    expect(appended.ksyunElementId).toBe(12345);
  });

  it("tags every entry with the source library element id", () => {
    const el = makeElement({ id: "lib_42", imageIds: ["a", "b"] });
    const { next } = applyElementToKlingElements(el, []);
    expect(next[0].libraryElementId).toBe("lib_42");
  });

  it("returns an error when imageIds has fewer than 2", () => {
    const el = makeElement({ imageIds: ["only-one"] });
    const { next, error } = applyElementToKlingElements(el, current);
    expect(error).toBe("min-images");
    expect(next).toBe(current);
  });

  it("returns an error and leaves current untouched when imageIds is empty", () => {
    const el = makeElement({ imageIds: [] });
    const { next, error } = applyElementToKlingElements(el, current);
    expect(error).toBe("min-images");
    expect(next).toBe(current);
  });

  it("preserves existing elements when appending", () => {
    const el = makeElement({ imageIds: ["a", "b"] });
    const { next } = applyElementToKlingElements(el, current);
    expect(next[0]).toEqual(current[0]);
  });
});
