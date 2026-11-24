import { MAX_UPLOAD_BYTES } from "../config";
import { TranscriptBuilder, TranscriptError } from "./parse";
import type { Run } from "./types";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

const YIELD_EVERY_LINES = 500;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function* readChunks(file: Blob): AsyncGenerator<string> {
  if (typeof file.stream === "function" && typeof TextDecoderStream !== "undefined") {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  }
  yield await file.text();
}

export type ReadProgress = { bytesRead: number; totalBytes: number };

export async function readTranscriptFile(
  file: File,
  id: string,
  onProgress?: (progress: ReadProgress) => void,
): Promise<Run> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (file.size === 0) {
    throw new TranscriptError("empty", "This file is empty.");
  }
  const builder = new TranscriptBuilder();
  let pending = "";
  let charsRead = 0;
  let linesSinceYield = 0;
  for await (const chunk of readChunks(file)) {
    charsRead += chunk.length;
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      builder.pushLine(line);
      linesSinceYield += 1;
      if (linesSinceYield >= YIELD_EVERY_LINES) {
        linesSinceYield = 0;
        onProgress?.({ bytesRead: Math.min(charsRead, file.size), totalBytes: file.size });
        await yieldToBrowser();
      }
    }
  }
  if (pending) builder.pushLine(pending);
  onProgress?.({ bytesRead: file.size, totalBytes: file.size });
  return builder.build(id);
}
