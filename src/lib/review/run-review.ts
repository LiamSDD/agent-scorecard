import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  REVIEW_EFFORT,
  REVIEW_FALLBACK_BETA,
  REVIEW_MAX_TOKENS,
  REVIEW_MODEL,
} from "../config";
import { buildReviewUserMessage, REVIEW_SYSTEM_PROMPT } from "./prompt";
import { ReviewSchema, type Review, type ReviewSummary } from "./schema";

export type ReviewOutcome =
  | { kind: "ok"; review: Review; model: string; fallbackUsed: boolean }
  | { kind: "refusal"; category: string | null }
  | { kind: "max_tokens" }
  | { kind: "empty"; stopReason: string | null };

export function createAnthropicClient(apiKey?: string): Anthropic {
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
}

export async function runReview(
  client: Anthropic,
  summary: ReviewSummary,
): Promise<ReviewOutcome> {
  const response = await client.beta.messages.parse({
    model: REVIEW_MODEL,
    max_tokens: REVIEW_MAX_TOKENS,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildReviewUserMessage(summary) }],
    output_config: {
      format: zodOutputFormat(ReviewSchema),
      effort: REVIEW_EFFORT,
    },
    betas: [REVIEW_FALLBACK_BETA],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") {
    return { kind: "refusal", category: response.stop_details?.category ?? null };
  }
  if (response.stop_reason === "max_tokens") {
    return { kind: "max_tokens" };
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    return { kind: "empty", stopReason: response.stop_reason ?? null };
  }
  return {
    kind: "ok",
    review: parsed,
    model: response.model,
    fallbackUsed: response.model !== REVIEW_MODEL,
  };
}
