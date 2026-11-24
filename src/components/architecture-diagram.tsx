const BOX = { rx: 6, strokeWidth: 1.5 };

function Box({ x, y, w, h, title, lines, accent = false }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={BOX.rx} fill="var(--surface)" stroke={accent ? "var(--accent)" : "var(--border)"} strokeWidth={BOX.strokeWidth} />
      <text x={x + 12} y={y + 22} fontSize="13" fontWeight="600" fill="var(--text)">
        {title}
      </text>
      {lines.map((line, position) => (
        <text key={line} x={x + 12} y={y + 42 + position * 17} fontSize="11.5" fill="var(--muted)" fontFamily="var(--font-mono)">
          {line}
        </text>
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label, dashed = false }: { x1: number; y1: number; x2: number; y2: number; label?: string; dashed?: boolean }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth="1.5" markerEnd="url(#arrowhead)" strokeDasharray={dashed ? "5 4" : undefined} />
      {label ? (
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} fontSize="11" textAnchor="middle" fill="var(--muted)">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 860 300" className="h-auto w-full" role="img" aria-labelledby="arch-title arch-desc">
      <title id="arch-title">agent-scorecard architecture</title>
      <desc id="arch-desc">
        The transcript file is parsed in the browser into a run model. Cost estimates and seven checks are computed in the
        browser. Only when the user clicks Run AI review does a compact, redacted summary go to the app&apos;s server route,
        which validates it and calls the Claude API, returning a structured scorecard.
      </desc>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
      </defs>
      <rect x="4" y="4" width="560" height="292" rx="10" fill="none" stroke="var(--border)" strokeDasharray="4 4" />
      <text x="18" y="26" fontSize="12" fontWeight="600" fill="var(--muted)">
        YOUR BROWSER
      </text>
      <rect x="584" y="4" width="272" height="292" rx="10" fill="none" stroke="var(--border)" strokeDasharray="4 4" />
      <text x="598" y="26" fontSize="12" fontWeight="600" fill="var(--muted)">
        SERVER (OPT-IN)
      </text>
      <Box x={20} y={44} w={160} h={92} title=".jsonl transcript" lines={["File API stream", "up to 50 MB"]} />
      <Box x={210} y={44} w={160} h={92} title="Parser" lines={["dedupe by message", "strip ANSI", "sidechains"]} accent />
      <Box x={400} y={44} w={150} h={92} title="Run model" lines={["turns, tools", "usage, cost"]} />
      <Box x={210} y={180} w={160} h={100} title="Checks + score" lines={["7 deterministic", "checks, 0-100", "hygiene score"]} />
      <Box x={400} y={180} w={150} h={100} title="Review summary" lines={["capped at 48 KB", "secrets redacted", "preview drawer"]} accent />
      <Box x={600} y={180} w={240} h={100} title="/api/review" lines={["zod validation, 64 KB cap", "per-IP rate limit (shared key)", "messages.parse + zod schema"]} />
      <Box x={600} y={44} w={240} h={92} title="Claude API" lines={["claude-opus-5-5", "structured output"]} accent />
      <Arrow x1={180} y1={90} x2={208} y2={90} />
      <Arrow x1={370} y1={90} x2={398} y2={90} />
      <Arrow x1={440} y1={136} x2={330} y2={178} />
      <Arrow x1={370} y1={230} x2={398} y2={230} />
      <Arrow x1={550} y1={230} x2={598} y2={230} label="on click" dashed />
      <Arrow x1={720} y1={178} x2={720} y2={138} />
    </svg>
  );
}
