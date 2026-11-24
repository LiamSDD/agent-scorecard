import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SAMPLE_IDS, type SampleId } from "../src/data/samples";
import { runChecks } from "../src/lib/checks";
import { REVIEW_MODEL } from "../src/lib/config";
import { createAnthropicClient, runReview } from "../src/lib/review/run-review";
import type { StoredReview } from "../src/lib/review/stored";
import { buildReviewSummary } from "../src/lib/review/summary";
import { parseTranscript } from "../src/lib/transcript/parse";

const SAMPLES_DIR = join(process.cwd(), "src/data/samples");

async function reviewSample(client: Anthropic, id: SampleId): Promise<void> {
  const text = await readFile(join(SAMPLES_DIR, `${id}.jsonl`), "utf8");
  const run = parseTranscript(text, `sample-${id}`);
  const summary = buildReviewSummary(run, runChecks(run));
  const outcome = await runReview(client, summary);
  if (outcome.kind !== "ok") {
    throw new Error(`Review for ${id} did not complete: ${outcome.kind}${outcome.kind === "refusal" && outcome.category ? ` (${outcome.category})` : ""}`);
  }
  const stored: StoredReview = {
    provenance: "model",
    model: outcome.model,
    generatedAt: new Date().toISOString(),
    review: outcome.review,
  };
  await writeFile(join(SAMPLES_DIR, `${id}.review.json`), `${JSON.stringify(stored, null, 2)}\n`);
  console.log(`${id}: written (${outcome.model}${outcome.fallbackUsed ? ", fallback" : ""})`);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to regenerate the sample reviews.");
    process.exit(1);
  }
  const only = process.argv.slice(2).filter((arg): arg is SampleId => (SAMPLE_IDS as readonly string[]).includes(arg));
  const targets = only.length > 0 ? only : [...SAMPLE_IDS];
  const client = createAnthropicClient();
  console.log(`Reviewing ${targets.join(", ")} with ${REVIEW_MODEL}`);
  for (const id of targets) {
    try {
      await reviewSample(client, id);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        console.error("ANTHROPIC_API_KEY was rejected.");
        process.exit(1);
      }
      if (error instanceof Anthropic.APIError) {
        console.error(`${id}: Anthropic API error (HTTP ${error.status ?? "unknown"})`);
        process.exitCode = 1;
        continue;
      }
      console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

void main();
