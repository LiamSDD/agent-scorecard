import cleanReview from "./clean.review.json";
import riskyReview from "./risky.review.json";
import wastefulReview from "./wasteful.review.json";

export const SAMPLE_IDS = ["clean", "risky", "wasteful"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

export type SampleMeta = {
  id: SampleId;
  name: string;
  blurb: string;
  repo: string;
};

export const SAMPLES: Record<SampleId, SampleMeta> = {
  clean: {
    id: "clean",
    name: "Clean bug fix",
    blurb: "Fixes a cart rounding bug test-first, runs the full suite and type-check, keeps the diff to six lines.",
    repo: "shop-api",
  },
  risky: {
    id: "risky",
    name: "Risky deploy",
    blurb: "Skips failing tests, pastes an API key into a curl command and force-pushes to main, then says it is all set.",
    repo: "notify-service",
  },
  wasteful: {
    id: "wasteful",
    name: "Wasteful feature",
    blurb: "Adds a CSV export but re-reads the same files repeatedly and sends grep work to Opus subagents.",
    repo: "shop-admin",
  },
};

export function isSampleId(value: string): value is SampleId {
  return (SAMPLE_IDS as readonly string[]).includes(value);
}

export const SAMPLE_REVIEWS: Record<SampleId, unknown> = {
  clean: cleanReview,
  risky: riskyReview,
  wasteful: wastefulReview,
};
