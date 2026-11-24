import { describe, expect, it } from "vitest";
import { SAMPLE_IDS, SAMPLE_REVIEWS } from "@/data/samples";
import { formatDuration, formatPercent, turnLabel } from "@/lib/format";
import { readStoredReview } from "@/lib/review/stored";
import { REVIEW_DIMENSIONS } from "@/lib/review/dimensions";
import { sampleRun, sampleText } from "./helpers";

describe("sample transcripts", () => {
  it.each(SAMPLE_IDS)("%s has 40 to 120 lines of synthetic data", (id) => {
    const text = sampleText(id);
    const lines = text.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(40);
    expect(lines.length).toBeLessThanOrEqual(120);
    expect(text).not.toMatch(/\/Users\/|C:\\\\Users/);
    expect(sampleRun(id).cwd).toMatch(/^\/home\/dev\//);
  });

  it("only contains an obviously fake API key", () => {
    const keys = SAMPLE_IDS.flatMap((id) => sampleText(id).match(/sk-ant-[A-Za-z0-9_-]+/g) ?? []);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).toContain("EXAMPLE");
  });
});

describe("committed example reviews", () => {
  it.each(SAMPLE_IDS)("%s validates and only cites turns that exist", (id) => {
    const stored = readStoredReview(SAMPLE_REVIEWS[id]);
    expect(stored).not.toBeNull();
    const turns = sampleRun(id).turns.length;
    for (const { key } of REVIEW_DIMENSIONS) {
      for (const turn of stored!.review[key].citedTurns) {
        expect(turn).toBeGreaterThanOrEqual(1);
        expect(turn).toBeLessThanOrEqual(turns);
      }
    }
  });

  it("are honestly labelled as hand-authored until regenerated", () => {
    for (const id of SAMPLE_IDS) {
      const stored = readStoredReview(SAMPLE_REVIEWS[id]);
      expect(stored?.provenance).toBe("hand-authored-example");
      expect(stored?.model).toBeNull();
    }
  });

  it("rejects malformed stored reviews", () => {
    expect(readStoredReview({ provenance: "model", model: "x", generatedAt: null, review: { verdict: "x" } })).toBeNull();
  });
});

describe("format helpers", () => {
  it("formats durations, percentages and turn labels", () => {
    expect(formatDuration(null)).toBe("unknown");
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(185_000)).toBe("3m 05s");
    expect(formatDuration(3_900_000)).toBe("1h 05m");
    expect(formatPercent(0.9298)).toBe("93%");
    expect(formatPercent(null)).toBe("n/a");
    expect(turnLabel(0)).toBe("T1");
  });
});
