import {
  CACHE_WRITE_1H_MULTIPLIER,
  CACHE_WRITE_5M_MULTIPLIER,
  FAMILY_FALLBACK,
  PRICING_PER_MTOK,
  type ModelPricing,
} from "./config";
import type { TokenUsage } from "./transcript/types";

export type PriceLookup =
  | { source: "exact"; modelId: string; pricing: ModelPricing }
  | { source: "family"; modelId: string; pricing: ModelPricing }
  | { source: "unpriced"; modelId: null; pricing: null };

const DATE_SUFFIX = /-\d{8}$/;

export function lookupPricing(
  model: string,
  table: Record<string, ModelPricing> = PRICING_PER_MTOK,
  families: Record<string, string> = FAMILY_FALLBACK,
): PriceLookup {
  const normalized = model.trim().toLowerCase().replace(DATE_SUFFIX, "");
  const exact = table[normalized];
  if (exact) return { source: "exact", modelId: normalized, pricing: exact };
  if (!normalized.startsWith("claude")) {
    return { source: "unpriced", modelId: null, pricing: null };
  }
  for (const [family, modelId] of Object.entries(families)) {
    const pricing = table[modelId];
    if (pricing && new RegExp(`(^|-)${family}(-|$)`).test(normalized)) {
      return { source: "family", modelId, pricing };
    }
  }
  return { source: "unpriced", modelId: null, pricing: null };
}

export function costForUsage(usage: TokenUsage, pricing: ModelPricing): number {
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  return (
    usage.input * perToken(pricing.input) +
    usage.output * perToken(pricing.output) +
    usage.cacheRead * perToken(pricing.cacheRead) +
    usage.cacheWrite5m * perToken(pricing.input * CACHE_WRITE_5M_MULTIPLIER) +
    usage.cacheWrite1h * perToken(pricing.input * CACHE_WRITE_1H_MULTIPLIER)
  );
}

export function costForModel(
  usage: TokenUsage,
  model: string,
): { costUsd: number | null; source: PriceLookup["source"] } {
  const lookup = lookupPricing(model);
  if (!lookup.pricing) return { costUsd: null, source: "unpriced" };
  return { costUsd: costForUsage(usage, lookup.pricing), source: lookup.source };
}

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
  };
}

export function cacheWriteTotal(usage: TokenUsage): number {
  return usage.cacheWrite5m + usage.cacheWrite1h;
}

export function promptTokens(usage: TokenUsage): number {
  return usage.input + usage.cacheRead + cacheWriteTotal(usage);
}

export function cacheHitRate(usage: TokenUsage): number | null {
  const total = promptTokens(usage);
  if (total === 0) return null;
  return usage.cacheRead / total;
}

export function formatUsd(value: number | null): string {
  if (value === null) return "unpriced";
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 10) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
