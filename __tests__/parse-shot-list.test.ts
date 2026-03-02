import { describe, it, expect } from "vitest";
import {
  parseShotList,
  createParseState,
  ParseEvent,
} from "@/lib/agents/parse-agent-output";

describe("parseShotList (SHOTLIST schema)", () => {
  const wrap = (json: object) => `<SHOTLIST>${JSON.stringify(json)}</SHOTLIST>`;

  const sampleShotList = {
    title: "My Shot List",
    columns: ["Shot", "Description", "Duration"],
    rows: [
      { id: "1", cells: [{ value: "Wide" }, { value: "Landscape" }, { value: "5s" }] },
      { id: "2", cells: [{ value: "Close" }, { value: "Portrait" }, { value: "3s" }] },
    ],
  };

  it("parses a valid shot list", () => {
    const state = createParseState(wrap(sampleShotList));
    const events: ParseEvent[] = [];
    const data = parseShotList(state, events);
    expect(data).toBeTruthy();
    expect(data!.title).toBe("My Shot List");
    expect(data!.columns).toEqual(["Shot", "Description", "Duration"]);
    expect(data!.rows).toHaveLength(2);
  });

  it("emits shot_list_start then part events", () => {
    const state = createParseState(wrap(sampleShotList));
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(events[0].type).toBe("shot_list_start");
    expect(events[1].type).toBe("part");
    expect(events[1].part.type).toBe("agent_shot_list");
    expect(events[1].part.status).toBe("complete");
  });

  it("uses default title when missing", () => {
    const state = createParseState(wrap({ columns: ["A"], rows: [] }));
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(events[1].part.title).toBe("Shot List");
  });

  it("handles missing columns gracefully (defaults to empty array)", () => {
    const state = createParseState(wrap({ title: "T", rows: [] }));
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(events[1].part.columns).toEqual([]);
  });

  it("handles missing rows gracefully (defaults to empty array)", () => {
    const state = createParseState(wrap({ title: "T", columns: ["A"] }));
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(events[1].part.rows).toEqual([]);
  });

  it("handles shot list with many rows", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      cells: [{ value: `Shot ${i}` }],
    }));
    const state = createParseState(wrap({ title: "Big List", columns: ["Shot"], rows }));
    const events: ParseEvent[] = [];
    const data = parseShotList(state, events);
    expect(data!.rows).toHaveLength(20);
  });

  it("returns null when closing tag is missing", () => {
    const state = createParseState('<SHOTLIST>{"title":"T","columns":[],"rows":[]}');
    const events: ParseEvent[] = [];
    expect(parseShotList(state, events)).toBeNull();
  });

  it("emits shot_list_start even when tag is not yet closed", () => {
    const state = createParseState("<SHOTLIST>partial...");
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("shot_list_start");
    expect(state.shotListStartSent).toBe(true);
  });

  it("throws on invalid JSON", () => {
    const state = createParseState("<SHOTLIST>not json</SHOTLIST>");
    state.shotListStartSent = true;
    const events: ParseEvent[] = [];
    expect(() => parseShotList(state, events)).toThrow();
  });

  it("preserves buffer rest after extraction", () => {
    const state = createParseState(wrap(sampleShotList) + "<TEXT>done</TEXT>");
    const events: ParseEvent[] = [];
    parseShotList(state, events);
    expect(state.buffer).toBe("<TEXT>done</TEXT>");
  });
});
