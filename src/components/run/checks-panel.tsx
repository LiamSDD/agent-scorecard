"use client";

import { useState } from "react";
import type { CheckResult } from "@/lib/checks/types";
import type { HygieneScore } from "@/lib/checks/score";
import { turnLabel } from "@/lib/format";
import { StatusBadge } from "../status-badge";

const GRADE_COLOR: Record<HygieneScore["grade"], string> = {
  good: "var(--success)",
  fair: "var(--warning)",
  poor: "var(--danger)",
};

function ScoreRing({ score, grade }: { score: number; grade: HygieneScore["grade"] }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label={`Hygiene score ${score} out of 100`}>
      <circle cx="44" cy="44" r={radius} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke={GRADE_COLOR[grade]}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="50" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--text)" fontFamily="var(--font-mono)">
        {score}
      </text>
    </svg>
  );
}

export function ScorePanel({ score }: { score: HygieneScore }) {
  return (
    <section aria-labelledby="score-title" className="card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={score.score} grade={score.grade} />
        <div>
          <h2 id="score-title" className="text-[16px] font-semibold">
            Hygiene score
          </h2>
          <p className="text-[13px] text-muted">
            100 minus weighted deductions: a failed check loses its full weight, a warning loses half.
          </p>
        </div>
      </div>
      <table className="mt-4 w-full text-[13px]">
        <caption className="sr-only">Score breakdown by check</caption>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="py-1 font-medium">Check</th>
            <th scope="col" className="py-1 pl-3 text-right font-medium">Weight</th>
            <th scope="col" className="py-1 pl-3 text-right font-medium">Lost</th>
          </tr>
        </thead>
        <tbody>
          {score.lines.map((line) => (
            <tr key={line.id} className="border-t border-border">
              <td className="py-1.5 pr-2">{line.title}</td>
              <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-muted">{line.weight}</td>
              <td
                className="py-1.5 pl-3 text-right font-mono tabular-nums"
                style={{ color: line.deduction > 0 ? (line.status === "fail" ? "var(--danger)" : "var(--warning)") : "var(--muted)" }}
              >
                {line.deduction > 0 ? `−${line.deduction}` : "0"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="py-1.5">Score</td>
            <td className="py-1.5 text-right font-mono tabular-nums text-muted">{score.max}</td>
            <td className="py-1.5 text-right font-mono tabular-nums">{score.score}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

const MAX_EVIDENCE_SHOWN = 6;

function CheckItem({ check, onJump }: { check: CheckResult; onJump: (turnIndex: number) => void }) {
  const [expanded, setExpanded] = useState(check.status !== "pass");
  const [showAll, setShowAll] = useState(false);
  const evidence = showAll ? check.evidence : check.evidence.slice(0, MAX_EVIDENCE_SHOWN);
  const panelId = `check-${check.id}-details`;
  return (
    <li className="border-t border-border first:border-t-0" data-check={check.id} data-status={check.status}>
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <StatusBadge status={check.status} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{check.title}</span>
          <span className="block text-[13px] text-muted">{check.summary}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`mt-0.5 shrink-0 text-muted ${expanded ? "rotate-180" : ""}`}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={panelId} hidden={!expanded} className="px-4 pb-4">
        <p className="text-[13px] text-muted">{check.description}</p>
        {evidence.length > 0 ? (
          <ul className="mt-3 space-y-2" aria-label={`Evidence for ${check.title}`}>
            {evidence.map((item, position) => (
              <li key={`${item.turnIndex}-${position}`} className="flex items-start gap-2 text-[13px]">
                <a
                  href={`#turn-${item.turnIndex}`}
                  className="badge badge-accent shrink-0 font-mono no-underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onJump(item.turnIndex);
                  }}
                  aria-label={`Jump to turn ${turnLabel(item.turnIndex)} in the timeline`}
                >
                  {turnLabel(item.turnIndex)}
                </a>
                <span className="min-w-0">
                  <span className="block">{item.label}</span>
                  {item.detail ? <code className="mt-0.5 block break-all text-[12px] text-muted">{item.detail}</code> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {check.evidence.length > MAX_EVIDENCE_SHOWN ? (
          <button type="button" className="mt-2 text-[13px] text-accent" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer" : `Show all ${check.evidence.length}`}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function ChecksPanel({ checks, onJump }: { checks: CheckResult[]; onJump: (turnIndex: number) => void }) {
  const counts = {
    fail: checks.filter((check) => check.status === "fail").length,
    warn: checks.filter((check) => check.status === "warn").length,
    pass: checks.filter((check) => check.status === "pass").length,
  };
  return (
    <section aria-labelledby="checks-title" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="checks-title" className="text-[16px] font-semibold">
          Automated checks
        </h2>
        <p className="text-[13px] text-muted">
          {counts.fail} failed, {counts.warn} {counts.warn === 1 ? "warning" : "warnings"}, {counts.pass} passed. Deterministic, computed in your browser.
        </p>
      </div>
      <ul>
        {checks.map((check) => (
          <CheckItem key={check.id} check={check} onJump={onJump} />
        ))}
      </ul>
    </section>
  );
}
