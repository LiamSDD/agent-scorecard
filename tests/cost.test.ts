import { describe, expect, it } from "vitest";
import { cacheHitRate, costForModel, costForUsage, formatTokens, formatUsd, lookupPricing } from "@/lib/cost";
import { PRICING_PER_MTOK } from "@/lib/config";

const MTOK = 1_000_000;
const usage = (overrides: Partial<Record<"input" | "output" | "cacheRead" | "cacheWrite5m" | "cacheWrite1h", number>>) => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  ...overrides,
});

describe("lookupPricing", () => {
  it("matches exact model ids from the pricing table", () => {
    expect(lookupPricing("claude-opus-5-5")).toMatchObject({ source: "exact", pricing: { input: 4, output: 20, cacheRead: 0.2 } });
    expect(lookupPricing("claude-haiku-5-5").pricing).toEqual({ input: 0.1, output: 0.5, cacheRead: 0.01 });
    expect(lookupPricing("claude-fable-5-2").pricing).toEqual({ input: 8, output: 40, cacheRead: 0.2 });
  });

  it("ignores dated suffixes and case", () => {
    expect(lookupPricing("Claude-Sonnet-5-5-20261001")).toMatchObject({ source: "exact", modelId: "claude-sonnet-5-5" });
  });

  it("falls back to the model family for older ids", () => {
    expect(lookupPricing("claude-3-5-sonnet-20241022")).toMatchObject({ source: "family", modelId: "claude-sonnet-5-5" });
    expect(lookupPricing("claude-opus-4-1-20250805")).toMatchObject({ source: "family", modelId: "claude-opus-5-5" });
    expect(lookupPricing("claude-3-haiku-20240307")).toMatchObject({ source: "family", modelId: "claude-haiku-5-5" });
  });

  it("returns unpriced for unknown or non-Claude models", () => {
    expect(lookupPricing("gpt-5")).toEqual({ source: "unpriced", modelId: null, pricing: null });
    expect(lookupPricing("<synthetic>").source).toBe("unpriced");
    expect(lookupPricing("claude-mystery-9").source).toBe("unpriced");
    expect(lookupPricing("not-opus-really").source).toBe("unpriced");
  });
});

describe("costForUsage", () => {
  it("prices input, output and cache reads per million tokens", () => {
    const price = PRICING_PER_MTOK["claude-opus-5-5"];
    expect(costForUsage(usage({ input: MTOK }), price)).toBeCloseTo(4);
    expect(costForUsage(usage({ output: MTOK }), price)).toBeCloseTo(20);
    expect(costForUsage(usage({ cacheRead: MTOK }), price)).toBeCloseTo(0.2);
  });

  it("prices 5 minute cache writes at 1.25x and 1 hour writes at 2x input", () => {
    const price = PRICING_PER_MTOK["claude-sonnet-5-5"];
    expect(costForUsage(usage({ cacheWrite5m: MTOK }), price)).toBeCloseTo(2.5);
    expect(costForUsage(usage({ cacheWrite1h: MTOK }), price)).toBeCloseTo(4);
  });

  it("adds all components together", () => {
    const price = PRICING_PER_MTOK["claude-haiku-5-5"];
    const total = costForUsage(usage({ input: 2 * MTOK, output: MTOK, cacheRead: 10 * MTOK, cacheWrite5m: MTOK }), price);
    expect(total).toBeCloseTo(0.2 + 0.5 + 0.1 + 0.125);
  });

  it("returns null cost for unpriced models", () => {
    expect(costForModel(usage({ input: MTOK }), "llama-4")).toEqual({ costUsd: null, source: "unpriced" });
    expect(costForModel(usage({ input: MTOK }), "claude-2.1").source).toBe("unpriced");
  });
});

describe("cacheHitRate and formatting", () => {
  it("is cache reads divided by all prompt tokens", () => {
    expect(cacheHitRate(usage({ input: 100, cacheRead: 700, cacheWrite5m: 200 }))).toBeCloseTo(0.7);
    expect(cacheHitRate(usage({ output: 10 }))).toBeNull();
  });

  it("formats dollars and tokens compactly", () => {
    expect(formatUsd(null)).toBe("unpriced");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.23456)).toBe("$1.235");
    expect(formatUsd(123.456)).toBe("$123.46");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(147_000)).toBe("147k");
    expect(formatTokens(2_500_000)).toBe("2.50M");
  });
});
