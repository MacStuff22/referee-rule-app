// ============================================================
// Situation matches — pairwise relationships between situations that
// duplicate or closely relate to each other (e.g. 16D and 24L ask the same
// question). Stored as pairs, not groups, because match type can vary within
// a connected set of situations: 72A and 76R are an exact match to each
// other, but each is only "very similar" to 80A — a flat group tag can't
// express that.
//
// Shared by the admin question editor (review/auto-update prompt) and the
// quiz-generation routes (suppressing matched pairs from co-occurring).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Question } from '@/types'

export type MatchType = 'exact_match' | 'very_similar' | 'similar_concept'

export interface SituationMatch {
  id: string
  situation_id_a: string
  situation_id_b: string
  match_type: MatchType
  created_by: string | null
  created_at: string
}

// Minimum gap (in cumulative question position) enforced across a Quiz
// Path's multi-day sequence. See trailingWindowSituations for the off-by-one
// derivation of the actual window size used.
export const MIN_SITUATION_GAP = 35

// Tiers suppressed from co-occurring in a quiz. similar_concept is excluded
// on purpose — those pairs often test intentionally different rulings on a
// related setup, so seeing both isn't the same problem as seeing a near-
// duplicate question twice.
const SUPPRESSION_TIERS: MatchType[] = ['exact_match', 'very_similar']

/** Always store/query pairs in this order so (A,B) and (B,A) never diverge. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

export function otherSituationId(
  match: Pick<SituationMatch, 'situation_id_a' | 'situation_id_b'>,
  situationId: string
): string {
  return match.situation_id_a === situationId ? match.situation_id_b : match.situation_id_a
}

/**
 * Direct pairwise matches touching one situation_id, either side. No
 * transitive/group inference — a 72A/76R/80A-style group relies on each of
 * its pairs being its own stored row.
 */
export async function getMatchesForSituation(
  supabase: SupabaseClient,
  situationId: string
): Promise<SituationMatch[]> {
  if (!situationId) return []
  const [aSide, bSide] = await Promise.all([
    supabase.from('situation_matches').select('*').eq('situation_id_a', situationId),
    supabase.from('situation_matches').select('*').eq('situation_id_b', situationId),
  ])
  if (aSide.error) throw new Error(`Failed to load situation matches: ${aSide.error.message}`)
  if (bSide.error) throw new Error(`Failed to load situation matches: ${bSide.error.message}`)
  return [...(aSide.data ?? []), ...(bSide.data ?? [])] as SituationMatch[]
}

/**
 * One situation_id can back more than one question row (e.g. "16B" backs
 * both a multiple_choice row and a separate scoreboard row).
 */
export async function getQuestionsBySituationIds(
  supabase: SupabaseClient,
  situationIds: string[]
): Promise<Question[]> {
  const ids = [...new Set(situationIds.filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('questions').select('*').in('situation_id', ids)
  if (error) throw new Error(`Failed to load matched questions: ${error.message}`)
  return (data ?? []) as Question[]
}

/** All rows usable for quiz suppression (exact_match + very_similar only). */
export async function getAllSuppressionMatches(
  supabase: SupabaseClient
): Promise<Pick<SituationMatch, 'situation_id_a' | 'situation_id_b' | 'match_type'>[]> {
  const { data, error } = await supabase
    .from('situation_matches')
    .select('situation_id_a, situation_id_b, match_type')
    .in('match_type', SUPPRESSION_TIERS)
  if (error) throw new Error(`Failed to load suppression matches: ${error.message}`)
  return data ?? []
}

/**
 * Symmetric adjacency for suppression purposes — direct edges only, no
 * transitive closure.
 */
export function buildSuppressionAdjacency(
  matches: Pick<SituationMatch, 'situation_id_a' | 'situation_id_b' | 'match_type'>[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    adjacency.get(a)!.add(b)
  }
  for (const m of matches) {
    if (!SUPPRESSION_TIERS.includes(m.match_type)) continue
    addEdge(m.situation_id_a, m.situation_id_b)
    addEdge(m.situation_id_b, m.situation_id_a)
  }
  return adjacency
}

export interface ExclusionTracker {
  isExcluded: (questionId: string) => boolean
  excludeAfterPick: (questionId: string) => void
}

/**
 * Tracks which questions are currently excluded because their situation is
 * matched to one already picked (or pre-excluded, e.g. from a Quiz Path's
 * recent history). Blank situation_id ('') is never treated as a real,
 * matchable key — most questions share it, and treating it as one would
 * make every blank-situation question mutually exclusive with every other.
 */
export function createSituationExclusionTracker(params: {
  situationIdByQuestionId: Map<string, string>
  adjacency: Map<string, Set<string>>
  preExcludedSituations?: Iterable<string>
}): ExclusionTracker {
  const { situationIdByQuestionId, adjacency, preExcludedSituations } = params
  const excludedSituations = new Set<string>(preExcludedSituations ?? [])

  return {
    isExcluded(questionId: string): boolean {
      const situationId = situationIdByQuestionId.get(questionId)
      if (!situationId) return false
      return excludedSituations.has(situationId)
    },
    excludeAfterPick(questionId: string): void {
      const situationId = situationIdByQuestionId.get(questionId)
      if (!situationId) return
      for (const partner of adjacency.get(situationId) ?? []) {
        excludedSituations.add(partner)
      }
    },
  }
}

/**
 * The trailing slice of a path's cumulative situation sequence that must
 * stay excluded for a new pick to guarantee >= minGap positions of
 * separation. With a cumulative sequence of length L, a new pick lands at
 * position L; a prior position p satisfies the gap requirement iff
 * p <= L - minGap, so the positions that must be excluded are the last
 * (minGap - 1) of them — 34 for minGap=35, giving an exact minimum gap of 35.
 */
export function trailingWindowSituations(
  cumulativeSituations: string[],
  minGap: number = MIN_SITUATION_GAP
): string[] {
  const windowSize = Math.max(0, minGap - 1)
  if (windowSize === 0) return []
  return cumulativeSituations.slice(-windowSize)
}

/**
 * Given a trailing window's situations, returns the set of situations that
 * must be blocked today — each window situation's matched partners, not the
 * window situations themselves.
 */
export function computeBlanketExclusion(
  windowSituations: string[],
  adjacency: Map<string, Set<string>>
): Set<string> {
  const excluded = new Set<string>()
  for (const situationId of windowSituations) {
    for (const partner of adjacency.get(situationId) ?? []) {
      excluded.add(partner)
    }
  }
  return excluded
}
