"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { formatUsd } from "@/lib/cost";
import { TranscriptError } from "@/lib/transcript/parse";
import { readTranscriptFile, UploadError } from "@/lib/transcript/read-file";
import { useRunStore } from "./run-store";

type UploadState =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string; progress: number }
  | { kind: "error"; fileName: string; message: string };

let uploadCounter = 0;

function nextRunId(): string {
  uploadCounter += 1;
  return `upload-${Date.now().toString(36)}-${uploadCounter}`;
}

export function UploadDropzone({ navigate = true }: { navigate?: boolean }) {
  const router = useRouter();
  const { addRun, runs } = useRunStore();
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();

  async function handleFile(file: File) {
    setState({ kind: "reading", fileName: file.name, progress: 0 });
    try {
      const run = await readTranscriptFile(file, nextRunId(), ({ bytesRead, totalBytes }) => {
        setState({ kind: "reading", fileName: file.name, progress: totalBytes ? bytesRead / totalBytes : 1 });
      });
      addRun(run, file.name);
      setState({ kind: "idle" });
      if (navigate) router.push(`/runs/local?id=${encodeURIComponent(run.id)}`);
    } catch (error) {
      const message =
        error instanceof TranscriptError || error instanceof UploadError
          ? error.message
          : "Could not read this file. Make sure it is a Claude Code .jsonl transcript.";
      setState({ kind: "error", fileName: file.name, message });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="rounded-lg border-2 border-dashed p-8 text-center sm:p-12"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border)",
          background: dragging ? "var(--accent-soft)" : "var(--surface)",
        }}
        data-testid="dropzone"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true" className="mx-auto text-muted">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-3 text-[15px] font-medium">Drop a Claude Code transcript here</p>
        <p id={hintId} className="mt-1 text-[13px] text-muted">
          A .jsonl file, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB. On macOS and Linux they live in ~/.claude/projects/.
        </p>
        <button type="button" className="btn btn-primary mt-4" aria-describedby={hintId} onClick={() => inputRef.current?.click()}>
          Choose a file
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          tabIndex={-1}
          aria-label="Transcript file"
          accept=".jsonl,.json,.txt,application/x-ndjson,application/json,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      <div aria-live="polite">
        {state.kind === "reading" ? (
          <div className="card p-4">
            <p className="text-[14px]">
              Parsing <span className="font-mono">{state.fileName}</span> in your browser…
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded bg-surface"
              role="progressbar"
              aria-label="Parsing progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(state.progress * 100)}
            >
              <div className="h-full bg-accent" style={{ width: `${Math.round(state.progress * 100)}%` }} />
            </div>
          </div>
        ) : null}
        {state.kind === "error" ? (
          <div role="alert" className="rounded-lg border border-danger p-4">
            <p className="text-[14px] font-semibold text-danger">
              Could not load <span className="font-mono">{state.fileName}</span>
            </p>
            <p className="mt-1 text-[14px]">{state.message}</p>
          </div>
        ) : null}
      </div>

      {runs.length > 0 ? (
        <section aria-labelledby="session-runs">
          <h2 id="session-runs" className="text-[15px] font-semibold">
            Uploaded in this tab
          </h2>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {runs.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px]">
                <Link href={`/runs/local?id=${encodeURIComponent(item.id)}`} className="min-w-0 truncate">
                  {item.run.title}
                </Link>
                <span className="font-mono text-[12px] text-muted">
                  {item.fileName} · {item.run.totals.turns} turns · {formatUsd(item.run.totals.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
