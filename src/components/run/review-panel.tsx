"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CheckResult } from "@/lib/checks/types";
import { REVIEW_MODEL, SHARED_KEY_RATE_LIMIT } from "@/lib/config";
import { turnLabel } from "@/lib/format";
import { REVIEW_DIMENSIONS } from "@/lib/review/dimensions";
import type { Review } from "@/lib/review/schema";
import type { StoredReview } from "@/lib/review/stored";
import { buildReviewSummary, summaryByteLength } from "@/lib/review/summary";
import type { Run } from "@/lib/transcript/types";

type ReviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; review: Review; model: string; fallbackUsed: boolean }
  | { kind: "error"; message: string };

function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((value) => (
        <span
          key={value}
          className="inline-block h-2 w-5 rounded-sm"
          style={{
            background:
              value <= score ? (score >= 4 ? "var(--success)" : score === 3 ? "var(--warning)" : "var(--danger)") : "var(--border)",
          }}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review,
  turnCount,
  onJump,
}: {
  review: Review;
  turnCount: number;
  onJump: (turnIndex: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] font-medium">{review.verdict}</p>
      <ul className="space-y-3">
        {REVIEW_DIMENSIONS.map(({ key, label }) => {
          const dimension = review[key];
          const cited = [...new Set(dimension.citedTurns)].filter((turn) => turn >= 1 && turn <= turnCount);
          return (
            <li key={key} className="border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="font-medium">{label}</h4>
                <ScoreDots score={dimension.score} />
                <span className="font-mono text-[13px] text-muted">{dimension.score} / 5</span>
              </div>
              <p className="mt-1 text-[14px]">{dimension.rationale}</p>
              {cited.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-1.5" aria-label={`Turns cited for ${label}`}>
                  {cited.map((turn) => (
                    <a
                      key={turn}
                      href={`#turn-${turn - 1}`}
                      className="badge badge-accent font-mono no-underline"
                      onClick={(event) => {
                        event.preventDefault();
                        onJump(turn - 1);
                      }}
                    >
                      {turnLabel(turn - 1)}
                    </a>
                  ))}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border pt-3">
        <h4 className="font-medium">Recommendations</h4>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px]">
          {review.recommendations.map((item) => (
            <li key={item.title}>
              <span className="font-medium">{item.title}.</span> {item.detail}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function PreviewDrawer({
  open,
  onClose,
  payload,
  bytes,
}: {
  open: boolean;
  onClose: () => void;
  payload: string;
  bytes: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog ref={ref} className="drawer" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 id={titleId} className="text-[16px] font-semibold">
              Exactly what will be sent
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              {(bytes / 1024).toFixed(1)} KB of JSON, built from the parsed run. Not the raw transcript: long text is
              truncated, file contents are omitted and detected secrets are replaced with [REDACTED]. Your API key, if you
              entered one, travels in the same request but is not part of this summary.
            </p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <pre className="mono-block m-4 max-h-none flex-1 overflow-auto" tabIndex={0} aria-label="Review request payload">
          {payload}
        </pre>
      </div>
    </dialog>
  );
}

export function ReviewPanel({
  run,
  checks,
  storedReview,
  onJump,
}: {
  run: Run;
  checks: CheckResult[];
  storedReview: StoredReview | null;
  onJump: (turnIndex: number) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<ReviewState>({ kind: "idle" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sharedKey, setSharedKey] = useState(false);
  const keyId = useId();
  const keyHelpId = useId();

  const summary = useMemo(() => buildReviewSummary(run, checks), [run, checks]);
  const payload = useMemo(() => JSON.stringify({ summary }, null, 2), [summary]);
  const bytes = useMemo(() => summaryByteLength(summary), [summary]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/review", { method: "GET" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!cancelled && body && typeof body === "object" && "sharedKey" in body) {
          setSharedKey((body as { sharedKey: unknown }).sharedKey === true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedKey = apiKey.trim();
  const canRun = state.kind !== "loading" && (trimmedKey.length > 0 || sharedKey);

  async function runReview() {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimmedKey ? { summary, apiKey: trimmedKey } : { summary }),
      });
      const [{ ReviewResponseSchema }, body] = await Promise.all([
        import("@/lib/review/schema"),
        response.json().catch(() => null),
      ]);
      const parsed = ReviewResponseSchema.safeParse(body);
      if (!parsed.success) {
        setState({ kind: "error", message: `Unexpected response from the server (HTTP ${response.status}).` });
        return;
      }
      if (parsed.data.ok) {
        setState({ kind: "done", review: parsed.data.review, model: parsed.data.model, fallbackUsed: parsed.data.fallbackUsed });
      } else {
        setState({ kind: "error", message: parsed.data.message });
      }
    } catch {
      setState({ kind: "error", message: "Could not reach the review endpoint. Check your connection and try again." });
    }
  }

  return (
    <section aria-labelledby="review-title" className="card">
      <div className="border-b border-border px-4 py-3">
        <h2 id="review-title" className="text-[16px] font-semibold">
          AI review
        </h2>
        <p className="text-[13px] text-muted">
          LLM-as-judge scorecard from {REVIEW_MODEL}, based on a compact summary of the run and the checks above.
        </p>
      </div>

      {state.kind === "done" ? (
        <div className="p-4">
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="badge badge-accent">Live review</span>
            <span className="text-muted">
              Generated just now by <code>{state.model}</code>
              {state.fallbackUsed ? " (server-side fallback model)" : ""}.
            </span>
          </p>
          <ReviewCard review={state.review} turnCount={run.turns.length} onJump={onJump} />
        </div>
      ) : storedReview ? (
        <div className="p-4">
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="badge whitespace-normal rounded-md">
              <span>
                Example review (generated with <code>npm run review:samples</code>)
              </span>
            </span>
          </p>
          <ReviewCard review={storedReview.review} turnCount={run.turns.length} onJump={onJump} />
          <p className="mt-4 border-t border-border pt-3 text-[12px] text-muted" data-testid="review-provenance">
            {storedReview.provenance === "hand-authored-example"
              ? "Footnote: this example review was written by hand to show the format. It did not come from the model. Run npm run review:samples with an API key to replace it with a real one."
              : `Footnote: generated by ${storedReview.model ?? "the model"}${storedReview.generatedAt ? ` on ${storedReview.generatedAt.slice(0, 10)}` : ""} and committed to the repository.`}
          </p>
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border p-4">
        <h3 className="text-[14px] font-semibold">{storedReview || state.kind === "done" ? "Run a fresh review" : "Run a review"}</h3>
        <div>
          <label htmlFor={keyId} className="block text-[13px] font-medium">
            Anthropic API key{sharedKey ? " (optional)" : ""}
          </label>
          <input
            id={keyId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="input mt-1 font-mono"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            aria-describedby={keyHelpId}
          />
          <p id={keyHelpId} className="mt-1 text-[12px] text-muted">
            Used for this one request, sent over HTTPS to this app&apos;s server function and to Anthropic, never stored or logged.
            {sharedKey
              ? ` Leave it empty to use this server's shared key (limited to ${SHARED_KEY_RATE_LIMIT.limit} reviews per hour per visitor).`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)}>
            Preview what will be sent
          </button>
          <button type="button" className="btn btn-primary" disabled={!canRun} onClick={runReview}>
            {state.kind === "loading" ? "Reviewing…" : "Run AI review"}
          </button>
        </div>
        <p className="text-[12px] text-muted">
          Sends a {(bytes / 1024).toFixed(1)} KB summary{summary.omittedSteps > 0 ? ` (${summary.omittedSteps} middle turns omitted to fit the cap)` : ""}. Reviews usually take 20 to 60 seconds.
        </p>
        <div aria-live="polite">
          {state.kind === "error" ? (
            <p role="alert" className="rounded-md border border-danger p-3 text-[13px] text-danger">
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
      <PreviewDrawer open={previewOpen} onClose={() => setPreviewOpen(false)} payload={payload} bytes={bytes} />
    </section>
  );
}
