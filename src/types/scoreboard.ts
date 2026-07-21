// ============================================================
// Scoreboard question types + runtime validation (Zod)
//
// The scoreboard "config" is stored inside questions.sub_questions[0]
// as a free-form JSON blob. These schemas give it a single, validated
// shape: the TypeScript types are inferred from the schemas, so there is
// exactly one source of truth, and parseScoreboardConfig() lets callers
// reject malformed rows instead of crashing the simulator.
// ============================================================

import { z } from 'zod'

export const penaltyTypeSchema = z.enum(['minor', 'double_minor', 'major', 'match'])
export type PenaltyType = z.infer<typeof penaltyTypeSchema>

export const singlePenaltySchema = z.object({
  penalty_type: penaltyTypeSchema,
  infraction: z.string().default(''),
})
export type SinglePenalty = z.infer<typeof singlePenaltySchema>

export const scoreboardEventSchema = z.object({
  gt: z.number(),                       // game time in seconds (stored form)
  type: z.enum(['penalty', 'goal']),
  team: z.enum(['A', 'B']),
  player: z.string().default(''),
  penalties: z.array(singlePenaltySchema).default([]),
})
export type ScoreboardEvent = z.infer<typeof scoreboardEventSchema>

export const scoreboardPlayerAnswerSchema = z.object({
  team: z.enum(['A', 'B']),
  player: z.string().default(''),
  correct_secs: z.number().default(0),
  wash_out: z.boolean().default(false),
  already_expired: z.boolean().default(false),
})
export type ScoreboardPlayerAnswer = z.infer<typeof scoreboardPlayerAnswerSchema>

export const scoreboardSituationTypeSchema = z.enum(['coincidental', 'expiration'])
export type ScoreboardSituationType = z.infer<typeof scoreboardSituationTypeSchema>

export const scoreboardConfigSchema = z.object({
  situation_type: scoreboardSituationTypeSchema.default('expiration'),
  period: z.number().default(3),
  start_gt: z.number().default(0),
  events: z.array(scoreboardEventSchema).default([]),
  player_answers: z.array(scoreboardPlayerAnswerSchema).default([]),
})
export type ScoreboardConfig = z.infer<typeof scoreboardConfigSchema>

/**
 * Validate an unknown value (typically questions.sub_questions[0] loaded
 * from the database) into a ScoreboardConfig. Returns null when the data
 * cannot be trusted, so callers can render an error state rather than crash.
 */
export function parseScoreboardConfig(raw: unknown): ScoreboardConfig | null {
  const result = scoreboardConfigSchema.safeParse(raw)
  return result.success ? result.data : null
}
