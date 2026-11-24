import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_REQUEST_MAX_BYTES, SHARED_KEY_RATE_LIMIT } from "../config";
import { clientIp, SlidingWindowRateLimiter } from "../rate-limit";
import { createAnthropicClient, runReview } from "./run-review";
import { ReviewRequestSchema, type ReviewResponse } from "./schema";

export const sharedKeyLimiter = new SlidingWindowRateLimiter(
  SHARED_KEY_RATE_LIMIT.limit,
  SHARED_KEY_RATE_LIMIT.windowMs,
);

type ErrorBody = Extract<ReviewResponse, { ok: false }>;

function json(body: ReviewResponse, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders },
  });
}

function fail(status: number, error: string, message: string, extraHeaders?: Record<string, string>): Response {
  const body: ErrorBody = { ok: false, error, message };
  return json(body, status, extraHeaders);
}

async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export function sharedKeyAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function handleReviewRequest(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return fail(415, "unsupported_media_type", "Send the run summary as application/json.");
  }
  const raw = await readLimitedBody(request, REVIEW_REQUEST_MAX_BYTES);
  if (raw === null) {
    return fail(413, "too_large", `The request is larger than ${REVIEW_REQUEST_MAX_BYTES / 1024} KB.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_json", "The request body is not valid JSON.");
  }
  const parsed = ReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(root)"))].slice(0, 5);
    return fail(400, "invalid_request", `The run summary failed validation at: ${fields.join(", ")}.`);
  }

  const userKey = parsed.data.apiKey;
  const usingSharedKey = !userKey;
  if (usingSharedKey) {
    if (!sharedKeyAvailable()) {
      return fail(401, "key_required", "Add your Anthropic API key to run a review. This server has no shared key.");
    }
    const decision = sharedKeyLimiter.check(clientIp(request.headers));
    if (!decision.allowed) {
      return fail(
        429,
        "rate_limited",
        `The shared key allows ${SHARED_KEY_RATE_LIMIT.limit} reviews per hour per visitor. Try again later or use your own key.`,
        { "retry-after": String(decision.retryAfterSeconds) },
      );
    }
  }

  try {
    const outcome = await runReview(createAnthropicClient(userKey), parsed.data.summary);
    switch (outcome.kind) {
      case "ok":
        return json({ ok: true, review: outcome.review, model: outcome.model, fallbackUsed: outcome.fallbackUsed }, 200);
      case "refusal":
        return fail(
          422,
          "refusal",
          `Claude declined to review this run${outcome.category ? ` (category: ${outcome.category})` : ""}. Nothing was wrong with your key; the content of the summary triggered a refusal.`,
        );
      case "max_tokens":
        return fail(502, "max_tokens", "The review ran out of output tokens before it finished. Try again.");
      default:
        return fail(502, "empty_output", "The model returned no structured review. Try again.");
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return usingSharedKey
        ? fail(502, "shared_key_invalid", "The server's shared key was rejected. Use your own key instead.")
        : fail(401, "invalid_key", "Anthropic rejected that API key. Check it and try again.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, "upstream_rate_limited", "Anthropic is rate limiting this key right now. Wait a minute and retry.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      return fail(400, "upstream_bad_request", "Anthropic rejected the request as invalid.");
    }
    if (error instanceof Anthropic.APIError) {
      return fail(502, "upstream_error", `Anthropic returned an error${error.status ? ` (HTTP ${error.status})` : ""}. Try again shortly.`);
    }
    if (error instanceof Anthropic.AnthropicError) {
      return fail(502, "invalid_output", "The model's response did not match the review schema. Try again.");
    }
    return fail(500, "internal_error", "Something went wrong while running the review.");
  }
}
