import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { SAMPLE_REVIEWS, SAMPLES, type SampleId } from "@/data/samples";
import { readStoredReview, type StoredReview } from "./review/stored";
import { parseTranscript } from "./transcript/parse";
import type { Run } from "./transcript/types";

export type LoadedSample = {
  meta: (typeof SAMPLES)[SampleId];
  run: Run;
  review: StoredReview | null;
};

export async function loadSampleText(id: SampleId): Promise<string> {
  "use cache";
  cacheLife("max");
  return readFile(join(process.cwd(), "src/data/samples", `${id}.jsonl`), "utf8");
}

export async function loadSample(id: SampleId): Promise<LoadedSample> {
  "use cache";
  cacheLife("max");
  const text = await loadSampleText(id);
  return {
    meta: SAMPLES[id],
    run: parseTranscript(text, `sample-${id}`),
    review: readStoredReview(SAMPLE_REVIEWS[id]),
  };
}
