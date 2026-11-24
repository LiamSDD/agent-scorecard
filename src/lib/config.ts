export const REVIEW_MODEL = "claude-opus-5-5";
export const REVIEW_MAX_TOKENS = 16000;
export const REVIEW_EFFORT = "medium" as const;
export const REVIEW_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ModelPricing = {
  input: number;
  output: number;
  cacheRead: number;
};

export const PRICING_PER_MTOK: Record<string, ModelPricing> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};

export const FAMILY_FALLBACK: Record<string, string> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
  fable: "claude-fable-5-2",
};

export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_DISPLAY_TEXT_CHARS = 4000;
export const MAX_INPUT_STRING_CHARS = 20000;

export const REVIEW_SUMMARY_MAX_BYTES = 48 * 1024;
export const REVIEW_REQUEST_MAX_BYTES = 64 * 1024;
export const SHARED_KEY_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };
