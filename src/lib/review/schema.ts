import { z } from "zod";

export const DimensionSchema = z.object({
  score: z.number().int().min(1).max(5),
  rationale: z.string(),
  citedTurns: z.array(z.number().int()),
});

export const RecommendationSchema = z.object({
  title: z.string(),
  detail: z.string(),
});

export const ReviewSchema = z.object({
  verdict: z.string(),
  taskCompletion: DimensionSchema,
  codeQuality: DimensionSchema,
  safety: DimensionSchema,
  efficiency: DimensionSchema,
  communication: DimensionSchema,
  recommendations: z.array(RecommendationSchema).min(3).max(3),
});

export type Review = z.infer<typeof ReviewSchema>;

const shortText = (max: number) => z.string().max(max);

export const SummaryToolSchema = z.object({
  name: shortText(60),
  target: shortText(240),
  error: z.boolean().optional(),
  outputExcerpt: shortText(400).optional(),
});

export const SummaryStepSchema = z.object({
  turn: z.number().int().min(1),
  agent: shortText(40).optional(),
  model: shortText(80).optional(),
  text: shortText(400).optional(),
  tools: z.array(SummaryToolSchema).max(30),
});

export const SummaryCheckSchema = z.object({
  id: shortText(60),
  title: shortText(120),
  status: z.enum(["pass", "warn", "fail"]),
  summary: shortText(400),
  turns: z.array(z.number().int()).max(20),
});

export const ReviewSummarySchema = z.object({
  schemaVersion: z.literal(1),
  task: shortText(2000),
  followUps: z.array(shortText(400)).max(5),
  models: z.array(shortText(80)).max(10),
  totals: z.object({
    turns: z.number().int().min(0),
    toolCalls: z.number().int().min(0),
    subagents: z.number().int().min(0),
    durationSeconds: z.number().min(0).nullable(),
    estimatedCostUsd: z.number().min(0).nullable(),
    cacheHitRate: z.number().min(0).max(1).nullable(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    cacheReadTokens: z.number().int().min(0),
    cacheWriteTokens: z.number().int().min(0),
  }),
  hygieneScore: z.number().min(0).max(100),
  checks: z.array(SummaryCheckSchema).max(20),
  steps: z.array(SummaryStepSchema).max(120),
  omittedSteps: z.number().int().min(0),
  finalAnswer: shortText(2400),
});

export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const ReviewRequestSchema = z.object({
  summary: ReviewSummarySchema,
  apiKey: z.string().trim().min(1).max(400).optional(),
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

export const ReviewResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    review: ReviewSchema,
    model: z.string(),
    fallbackUsed: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    message: z.string(),
  }),
]);

export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
