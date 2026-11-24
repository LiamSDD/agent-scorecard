"use client";

import { useEffect, useMemo, useState } from "react";
import { redactSecrets } from "@/lib/checks/secrets";
import { cacheWriteTotal, formatTokens, formatUsd } from "@/lib/cost";
import { formatTime, turnLabel } from "@/lib/format";
import { TOOL_FILTERS } from "@/lib/transcript/tools";
import type { Run, TimelineItem, ToolCall, ToolCategory, Turn } from "@/lib/transcript/types";
import { shortModel } from "./run-header";

const PAGE_SIZE = 150;
const PREVIEW_CHARS = 280;

type Filter = ToolCategory | "all";

function matchesFilter(turn: Turn, filter: Filter): boolean {
  if (filter === "all") return true;
  return turn.toolCalls.some((call) => call.category === filter);
}

function stringifyInput(input: Record<string, unknown>): string {
  try {
    const text = redactSecrets(JSON.stringify(input, null, 2));
    return text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
  } catch {
    return "(unserialisable input)";
  }
}

function ToolRow({ call, expanded }: { call: ToolCall; expanded: boolean }) {
  const failed = call.result?.isError === true;
  const target = redactSecrets(call.target);
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className={`badge shrink-0 font-mono ${failed ? "badge-fail" : ""}`}>{call.name}</span>
        <code
          className={`min-w-0 break-all pt-px text-[12.5px] ${call.category === "bash" ? "text-text" : "text-muted"} ${expanded ? "" : "line-clamp-2"}`}
        >
          {call.category === "bash" ? `$ ${target}` : target}
        </code>
        {failed ? <span className="sr-only">(failed)</span> : null}
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 pl-1">
          <div>
            <p className="label-caps mb-1">Input</p>
            <pre className="mono-block">{stringifyInput(call.input)}</pre>
          </div>
          {call.result ? (
            <div>
              <p className="label-caps mb-1">
                Result{failed ? " (error)" : ""} · {call.result.chars.toLocaleString("en-US")} chars
              </p>
              <pre className="mono-block">{redactSecrets(call.result.text) || "(empty)"}</pre>
            </div>
          ) : (
            <p className="text-[12px] text-muted">No result recorded.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function TurnCard({
  run,
  turn,
  expanded,
  highlighted,
  onToggle,
}: {
  run: Run;
  turn: Turn;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  const agent = turn.agentId ? run.subagents.find((item) => item.id === turn.agentId) : null;
  const long = turn.text.length > PREVIEW_CHARS;
  const text = expanded || !long ? turn.text : `${turn.text.slice(0, PREVIEW_CHARS).trimEnd()}…`;
  const detailsId = `turn-${turn.index}-details`;
  return (
    <article
      id={`turn-${turn.index}`}
      tabIndex={-1}
      aria-label={`Turn ${turnLabel(turn.index)}`}
      className={`card scroll-mt-24 p-3 sm:p-4 ${highlighted ? "turn-highlight" : ""} ${agent ? "ml-3 border-l-[3px] sm:ml-6" : ""}`}
      style={agent ? { borderLeftColor: "var(--accent)" } : undefined}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="font-mono font-semibold">{turnLabel(turn.index)}</span>
        {agent ? <span className="badge badge-accent">{agent.label}</span> : null}
        <span className="font-mono text-muted">{shortModel(turn.model)}</span>
        {turn.timestamp ? <span className="font-mono text-muted">{formatTime(turn.timestamp)}</span> : null}
        <span className="ml-auto flex items-center gap-3 font-mono tabular-nums text-muted">
          <span title="Input + cache read + cache write tokens">
            in {formatTokens(turn.usage.input + turn.usage.cacheRead + cacheWriteTotal(turn.usage))}
          </span>
          <span title="Output tokens">out {formatTokens(turn.usage.output)}</span>
          <span className="text-text" title={turn.priceSource === "family" ? "Priced by model family fallback" : undefined}>
            {formatUsd(turn.costUsd)}
          </span>
        </span>
      </header>
      {text ? <p className="mt-2 whitespace-pre-wrap break-words text-[14px]">{text}</p> : null}
      {turn.toolCalls.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {turn.toolCalls.map((call) => (
            <ToolRow key={call.id} call={call} expanded={expanded} />
          ))}
        </ul>
      ) : null}
      {expanded ? (
        <dl id={detailsId} className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[12px] sm:grid-cols-5">
          {[
            ["Input", turn.usage.input],
            ["Output", turn.usage.output],
            ["Cache read", turn.usage.cacheRead],
            ["Cache write 5m", turn.usage.cacheWrite5m],
            ["Cache write 1h", turn.usage.cacheWrite1h],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono tabular-nums">{(value as number).toLocaleString("en-US")}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {turn.toolCalls.length > 0 || long ? (
        <button type="button" className="mt-2 text-[13px] text-accent" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? "Hide details" : "Show details"}
        </button>
      ) : null}
    </article>
  );
}

function PromptCard({ item }: { item: Extract<TimelineItem, { kind: "prompt" }> }) {
  const [expanded, setExpanded] = useState(false);
  const long = item.text.length > PREVIEW_CHARS * 2;
  return (
    <article className={`rounded-lg border border-border bg-surface p-3 sm:p-4 ${item.agentId ? "ml-3 sm:ml-6" : ""}`} aria-label={item.agentId ? "Subagent prompt" : "User prompt"}>
      <p className="label-caps">{item.agentId ? "Subagent prompt" : "User"}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-[14px]">
        {expanded || !long ? item.text : `${item.text.slice(0, PREVIEW_CHARS * 2).trimEnd()}…`}
      </p>
      {long ? (
        <button type="button" className="mt-1 text-[13px] text-accent" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </article>
  );
}

export function Timeline({
  run,
  focusRequest,
}: {
  run: Run;
  focusRequest: { turnIndex: number; nonce: number } | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showSubagents, setShowSubagents] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [handledNonce, setHandledNonce] = useState<number | null>(null);

  const availableFilters = useMemo(() => {
    const present = new Set(run.turns.flatMap((turn) => turn.toolCalls.map((call) => call.category)));
    return TOOL_FILTERS.filter((item) => item.id === "all" || present.has(item.id as ToolCategory)).map((item) => ({
      ...item,
      count:
        item.id === "all"
          ? run.totals.toolCalls
          : run.turns.reduce((sum, turn) => sum + turn.toolCalls.filter((call) => call.category === item.id).length, 0),
    }));
  }, [run]);

  const visibleItems = useMemo(() => {
    return run.timeline.filter((item) => {
      if (item.kind === "turn") {
        const turn = run.turns[item.turnIndex];
        if (!turn) return false;
        if (!showSubagents && turn.agentId) return false;
        return matchesFilter(turn, filter);
      }
      if (filter !== "all") return false;
      if (item.kind === "prompt" && item.agentId && !showSubagents) return false;
      return true;
    });
  }, [run, filter, showSubagents]);

  if (focusRequest && handledNonce !== focusRequest.nonce) {
    setHandledNonce(focusRequest.nonce);
    const target = focusRequest.turnIndex;
    const turn = run.turns[target];
    if (turn) {
      const position = run.timeline.findIndex((item) => item.kind === "turn" && item.turnIndex === target);
      if (!matchesFilter(turn, filter)) setFilter("all");
      if (turn.agentId && !showSubagents) setShowSubagents(true);
      if (position >= limit) setLimit(position + PAGE_SIZE);
      setExpanded((current) => new Set(current).add(target));
      setHighlighted(target);
    }
  }

  useEffect(() => {
    if (!focusRequest) return;
    const element = document.getElementById(`turn-${focusRequest.turnIndex}`);
    if (!element) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    element.focus({ preventScroll: true });
  }, [focusRequest]);

  const shown = visibleItems.slice(0, limit);

  function toggle(index: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section aria-labelledby="timeline-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="timeline-title" className="text-[16px] font-semibold">
          Timeline
        </h2>
        <p className="text-[13px] text-muted" aria-live="polite">
          Showing {Math.min(limit, visibleItems.length)} of {visibleItems.length} items
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tool type">
        {availableFilters.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
            <span className="font-mono text-[12px] text-muted">{item.count}</span>
          </button>
        ))}
        {run.subagents.length > 0 ? (
          <label className="ml-auto inline-flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={showSubagents} onChange={(event) => setShowSubagents(event.target.checked)} />
            Show subagent turns
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            setExpanded((current) => (current.size > 0 ? new Set() : new Set(run.turns.map((turn) => turn.index))))
          }
        >
          {expanded.size > 0 ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ol className="space-y-2">
        {shown.map((item) => (
          <li key={item.id}>
            {item.kind === "prompt" ? (
              <PromptCard item={item} />
            ) : item.kind === "compaction" ? (
              <div className="flex items-center gap-3 py-1 text-[12px] text-muted" role="note">
                <span className="h-px flex-1 bg-border" />
                <span>Context compacted</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <TurnCard
                run={run}
                turn={run.turns[item.turnIndex]}
                expanded={expanded.has(item.turnIndex)}
                highlighted={highlighted === item.turnIndex}
                onToggle={() => toggle(item.turnIndex)}
              />
            )}
          </li>
        ))}
      </ol>
      {visibleItems.length > limit ? (
        <button type="button" className="btn w-full" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, visibleItems.length - limit)} more
        </button>
      ) : null}
      {visibleItems.length === 0 ? <p className="text-[14px] text-muted">No turns match this filter.</p> : null}
    </section>
  );
}
