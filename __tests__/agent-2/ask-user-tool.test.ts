import { describe, it, expect } from "vitest";
import { askUserTool } from "@/lib/agents/agent-2/tools/ask-user";

describe("askUserTool", () => {
  describe("metadata", () => {
    it("has correct name and tag", () => {
      expect(askUserTool.name).toBe("ask_user");
      expect(askUserTool.tag).toBe("ASK_USER");
    });

    it("is a passive tool", () => {
      expect(askUserTool.waitForOutput).toBe(false);
      expect(askUserTool.fireAndForget).toBeUndefined();
    });

    it("allows at most 1 occurrence", () => {
      expect(askUserTool.maxOccurrences).toBe(1);
    });
  });

  describe("parseContent", () => {
    const parse = askUserTool.parseContent!;

    it("parses a valid single question", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "What style?", options: ["Cinematic", "Bright"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "q1",
        question: "What style?",
        options: ["Cinematic", "Bright"],
      });
    });

    it("parses multiple questions", () => {
      const raw = JSON.stringify([
        { id: "purpose", question: "What is this for?", options: ["Ad", "Demo"] },
        { id: "duration", question: "How long?", options: ["15s", "30s", "60s"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("purpose");
      expect(result[1].id).toBe("duration");
    });

    it("caps at 3 questions", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "Q1?", options: ["A", "B"] },
        { id: "q2", question: "Q2?", options: ["A", "B"] },
        { id: "q3", question: "Q3?", options: ["A", "B"] },
        { id: "q4", question: "Q4?", options: ["A", "B"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(3);
    });

    it("caps options at 4 per question", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "Pick?", options: ["A", "B", "C", "D", "E"] },
      ]);
      const result = parse(raw);
      expect(result[0].options).toHaveLength(4);
      expect(result[0].options).toEqual(["A", "B", "C", "D"]);
    });

    it("filters out questions with fewer than 2 options", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "Too few", options: ["Only one"] },
        { id: "q2", question: "Valid", options: ["A", "B"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("q2");
    });

    it("filters out questions missing required fields", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "Missing options" },
        { question: "Missing id", options: ["A", "B"] },
        { id: "q3", options: ["A", "B"] },
        { id: "q4", question: "Valid", options: ["A", "B"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("q4");
    });

    it("filters out non-string options", () => {
      const raw = JSON.stringify([
        { id: "q1", question: "Bad opts", options: [1, 2] },
        { id: "q2", question: "Good", options: ["A", "B"] },
      ]);
      const result = parse(raw);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("q2");
    });

    it("returns empty array for non-array input", () => {
      const result = parse('{"not": "an array"}');
      expect(result).toEqual([]);
    });

    it("handles whitespace around the JSON", () => {
      const raw = `  [{"id":"q1","question":"Q?","options":["A","B"]}]  `;
      const result = parse(raw);
      expect(result).toHaveLength(1);
    });
  });

  describe("createPart", () => {
    const create = askUserTool.createPart!;

    it("creates an agent_ask_user part", () => {
      const questions = [
        { id: "q1", question: "What style?", options: ["Cinematic", "Bright"] },
      ];
      const part = create(questions, {} as any);
      expect(part).toEqual({
        type: "agent_ask_user",
        questions,
      });
    });

    it("preserves multiple questions", () => {
      const questions = [
        { id: "q1", question: "Q1?", options: ["A", "B"] },
        { id: "q2", question: "Q2?", options: ["C", "D"] },
      ];
      const part = create(questions, {} as any);
      expect(part!.type).toBe("agent_ask_user");
      expect((part as any).questions).toHaveLength(2);
    });
  });
});
