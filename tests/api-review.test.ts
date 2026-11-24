import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/review/route";
import { runChecks } from "@/lib/checks";
import { REVIEW_MODEL, REVIEW_REQUEST_MAX_BYTES } from "@/lib/config";
import { sharedKeyLimiter } from "@/lib/review/handler";
import type { Review } from "@/lib/review/schema";
import { buildReviewSummary } from "@/lib/review/summary";
import { sampleRun } from "./helpers";

const sdk = vi.hoisted(() => ({ parse: vi.fn(), constructed: vi.fn() }));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const Real = actual.default;
  class FakeAnthropic {
    static AnthropicError = Real.AnthropicError;
    static APIError = Real.APIError;
    static AuthenticationError = Real.AuthenticationError;
    static RateLimitError = Real.RateLimitError;
    static BadRequestError = Real.BadRequestError;
    static InternalServerError = Real.InternalServerError;
    beta = { messages: { parse: sdk.parse } };
    messages = { parse: vi.fn() };
    constructor(options?: unknown) {
      sdk.constructed(options);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => undefined) };
});

const REVIEW: Review = {
  verdict: "Solid run.",
  taskCompletion: { score: 5, rationale: "Done at T11.", citedTurns: [11] },
  codeQuality: { score: 4, rationale: "Small diff.", citedTurns: [9] },
  safety: { score: 5, rationale: "Nothing risky.", citedTurns: [] },
  efficiency: { score: 5, rationale: "Cheap.", citedTurns: [] },
  communication: { score: 5, rationale: "Clear.", citedTurns: [14] },
  recommendations: [
    { title: "a", detail: "a" },
    { title: "b", detail: "b" },
    { title: "c", detail: "c" },
  ],
};

const run = sampleRun("clean");
const summary = buildReviewSummary(run, runChecks(run));

function request(body: unknown, init: { headers?: Record<string, string>; raw?: string } = {}): Request {
  return new Request("http://localhost/api/review", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

function okResponse(overrides: Record<string, unknown> = {}) {
  return { model: REVIEW_MODEL, stop_reason: "end_turn", stop_details: null, parsed_output: REVIEW, content: [], ...overrides };
}

const ERROR_BODY = { type: "error", error: { type: "x", message: "m" } };
const authError = () => new Anthropic.AuthenticationError(401, ERROR_BODY, "m", new Headers());
const rateLimitError = () => new Anthropic.RateLimitError(429, ERROR_BODY, "m", new Headers());
const badRequestError = () => new Anthropic.BadRequestError(400, ERROR_BODY, "m", new Headers());
const overloadedError = () => new Anthropic.InternalServerError(529, ERROR_BODY, "m", new Headers());

beforeEach(() => {
  sdk.parse.mockReset();
  sdk.constructed.mockReset();
  sharedKeyLimiter.reset();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/review: validation", () => {
  it("rejects non-JSON content types", async () => {
    const response = await POST(request({ summary }, { headers: { "content-type": "text/plain" } }));
    expect(response.status).toBe(415);
  });

  it("rejects bodies larger than the cap without calling the SDK", async () => {
    const response = await POST(request(null, { raw: "x".repeat(REVIEW_REQUEST_MAX_BYTES + 1) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: "too_large" });
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("rejects declared content-length above the cap", async () => {
    const response = await POST(request({ summary, apiKey: "k" }, { headers: { "content-length": String(REVIEW_REQUEST_MAX_BYTES + 10) } }));
    expect(response.status).toBe(413);
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(request(null, { raw: "{nope" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_json" });
  });

  it("rejects summaries that fail schema validation and names the fields", async () => {
    const response = await POST(request({ summary: { ...summary, hygieneScore: 500, task: 7 }, apiKey: "k" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.message).toContain("summary.hygieneScore");
    expect(body.message).toContain("summary.task");
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("asks for a key when none is given and the server has no shared key", async () => {
    const response = await POST(request({ summary }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "key_required" });
  });
});

describe("POST /api/review: Claude call", () => {
  it("calls the beta parse endpoint with the configured model, structured output and fallbacks", async () => {
    sdk.parse.mockResolvedValue(okResponse());
    const response = await POST(request({ summary, apiKey: "sk-ant-user-key" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, review: REVIEW, model: REVIEW_MODEL, fallbackUsed: false });
    expect(sdk.constructed).toHaveBeenCalledWith({ apiKey: "sk-ant-user-key" });
    const params = sdk.parse.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    expect(params.messages[0].content).toContain("<run_summary>");
  });

  it("flags when a server-side fallback model answered", async () => {
    sdk.parse.mockResolvedValue(okResponse({ model: "claude-sonnet-5-5" }));
    const body = await (await POST(request({ summary, apiKey: "k" }))).json();
    expect(body).toMatchObject({ ok: true, model: "claude-sonnet-5-5", fallbackUsed: true });
  });

  it("reports refusals politely with the category", async () => {
    sdk.parse.mockResolvedValue(okResponse({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, parsed_output: null }));
    const response = await POST(request({ summary, apiKey: "k" }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("refusal");
    expect(body.message).toContain("category: cyber");
  });

  it("handles max_tokens and empty parsed output", async () => {
    sdk.parse.mockResolvedValueOnce(okResponse({ stop_reason: "max_tokens", parsed_output: null }));
    expect((await (await POST(request({ summary, apiKey: "k" }))).json()).error).toBe("max_tokens");
    sdk.parse.mockResolvedValueOnce(okResponse({ parsed_output: null }));
    expect((await (await POST(request({ summary, apiKey: "k" }))).json()).error).toBe("empty_output");
  });

  it("maps an invalid user key to a friendly 401", async () => {
    sdk.parse.mockRejectedValue(authError());
    const response = await POST(request({ summary, apiKey: "sk-ant-wrong" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_key", message: expect.stringMatching(/rejected that API key/) });
  });

  it("maps rate limits, bad requests and other API errors", async () => {
    sdk.parse.mockRejectedValueOnce(rateLimitError());
    expect((await POST(request({ summary, apiKey: "k" }))).status).toBe(429);
    sdk.parse.mockRejectedValueOnce(badRequestError());
    expect((await (await POST(request({ summary, apiKey: "k" }))).json()).error).toBe("upstream_bad_request");
    sdk.parse.mockRejectedValueOnce(overloadedError());
    const response = await POST(request({ summary, apiKey: "k" }));
    expect(response.status).toBe(502);
    expect((await response.json()).message).toContain("HTTP 529");
  });

  it("maps schema parse failures and unknown errors", async () => {
    sdk.parse.mockRejectedValueOnce(new Anthropic.AnthropicError("Failed to parse structured output"));
    expect((await (await POST(request({ summary, apiKey: "k" }))).json()).error).toBe("invalid_output");
    sdk.parse.mockRejectedValueOnce(new Error("boom"));
    expect((await POST(request({ summary, apiKey: "k" }))).status).toBe(500);
  });

  it("never echoes the API key back in any response", async () => {
    sdk.parse.mockRejectedValue(authError());
    const text = await (await POST(request({ summary, apiKey: "sk-ant-very-secret-value" }))).text();
    expect(text).not.toContain("very-secret");
  });
});

describe("POST /api/review: shared server key", () => {
  it("uses the environment key without passing an apiKey option", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-server");
    sdk.parse.mockResolvedValue(okResponse());
    const response = await POST(request({ summary }, { headers: { "x-forwarded-for": "203.0.113.1" } }));
    expect(response.status).toBe(200);
    expect(sdk.constructed).toHaveBeenCalledWith(undefined);
  });

  it("rate limits the shared key to 5 reviews per hour per IP", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-server");
    sdk.parse.mockResolvedValue(okResponse());
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await POST(request({ summary }, { headers }))).status).toBe(200);
    }
    const blocked = await POST(request({ summary }, { headers }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await POST(request({ summary }, { headers: { "x-forwarded-for": "198.51.100.5" } }))).status).toBe(200);
    expect((await POST(request({ summary, apiKey: "own-key" }, { headers }))).status).toBe(200);
  });

  it("reports a rejected shared key as a server problem, not the user's", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-server");
    sdk.parse.mockRejectedValue(authError());
    const response = await POST(request({ summary }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("shared_key_invalid");
  });
});

describe("GET /api/review", () => {
  it("reports whether a shared key is configured without revealing it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-server");
    const response = await GET();
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ sharedKey: true });
    expect(text).not.toContain("sk-ant");
  });
});
