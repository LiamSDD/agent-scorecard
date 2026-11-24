import { describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { TranscriptError } from "@/lib/transcript/parse";
import { readTranscriptFile, UploadError } from "@/lib/transcript/read-file";
import { sampleText } from "./helpers";

function chunkedFile(text: string, chunkSize: number, name = "run.jsonl"): File {
  const file = new File([text], name);
  const bytes = new TextEncoder().encode(text);
  Object.defineProperty(file, "stream", {
    value: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            controller.enqueue(bytes.slice(offset, offset + chunkSize));
          }
          controller.close();
        },
      }),
  });
  return file;
}

describe("readTranscriptFile", () => {
  it("streams a file in small chunks and parses lines split across chunk boundaries", async () => {
    const text = sampleText("clean");
    const run = await readTranscriptFile(chunkedFile(text, 97), "upload-1");
    expect(run.id).toBe("upload-1");
    expect(run.turns).toHaveLength(16);
    expect(run.stats.malformedCount).toBe(0);
  });

  it("reports progress up to the full file size", async () => {
    const onProgress = vi.fn();
    const text = sampleText("wasteful");
    await readTranscriptFile(chunkedFile(text, 4096), "upload-2", onProgress);
    const last = onProgress.mock.calls.at(-1)?.[0];
    expect(last.bytesRead).toBe(last.totalBytes);
  });

  it("parses a final line without a trailing newline", async () => {
    const text = sampleText("clean").trimEnd();
    const run = await readTranscriptFile(chunkedFile(text, 1000), "upload-3");
    expect(run.turns).toHaveLength(16);
  });

  it("rejects files over the size limit before reading", async () => {
    const file = new File(["x"], "huge.jsonl");
    Object.defineProperty(file, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await expect(readTranscriptFile(file, "x")).rejects.toBeInstanceOf(UploadError);
  });

  it("rejects empty files and non-transcripts with a TranscriptError", async () => {
    await expect(readTranscriptFile(new File([""], "empty.jsonl"), "x")).rejects.toBeInstanceOf(TranscriptError);
    await expect(readTranscriptFile(chunkedFile("# README\nhello", 4), "x")).rejects.toMatchObject({ code: "not_json" });
  });
});
