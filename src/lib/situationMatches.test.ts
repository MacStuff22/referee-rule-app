import { describe, it, expect } from 'vitest'
import {
  canonicalPair,
  buildSuppressionAdjacency,
  createSituationExclusionTracker,
  trailingWindowSituations,
  computeBlanketExclusion,
  MIN_SITUATION_GAP,
} from './situationMatches'

describe('canonicalPair', () => {
  it('is order-independent', () => {
    expect(canonicalPair('76R', '72A')).toEqual(canonicalPair('72A', '76R'))
  })
  it('sorts lexicographically', () => {
    expect(canonicalPair('76R', '72A')).toEqual(['72A', '76R'])
  })
})

describe('buildSuppressionAdjacency', () => {
  it('excludes similar_concept entirely', () => {
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'similar_concept' },
    ])
    expect(adjacency.size).toBe(0)
  })

  it('builds symmetric edges for exact_match and very_similar', () => {
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'exact_match' },
      { situation_id_a: 'B', situation_id_b: 'C', match_type: 'very_similar' },
    ])
    expect(adjacency.get('A')).toEqual(new Set(['B']))
    expect(adjacency.get('B')).toEqual(new Set(['A', 'C']))
    expect(adjacency.get('C')).toEqual(new Set(['B']))
  })

  it('produces exactly the stored edges for a mixed-tier group, with no transitive inference', () => {
    // 72A/76R are an exact match to each other, but each is only very_similar
    // to 80A — a naive group-level tag would get this wrong.
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: '72A', situation_id_b: '76R', match_type: 'exact_match' },
      { situation_id_a: '72A', situation_id_b: '80A', match_type: 'very_similar' },
      { situation_id_a: '76R', situation_id_b: '80A', match_type: 'very_similar' },
    ])
    expect(adjacency.get('72A')).toEqual(new Set(['76R', '80A']))
    expect(adjacency.get('76R')).toEqual(new Set(['72A', '80A']))
    expect(adjacency.get('80A')).toEqual(new Set(['72A', '76R']))
  })
})

describe('createSituationExclusionTracker', () => {
  it('never excludes on a blank situation_id', () => {
    const situationIdByQuestionId = new Map([
      ['q1', ''],
      ['q2', ''],
    ])
    const adjacency = new Map<string, Set<string>>()
    const tracker = createSituationExclusionTracker({ situationIdByQuestionId, adjacency })
    tracker.excludeAfterPick('q1')
    expect(tracker.isExcluded('q2')).toBe(false)
  })

  it('excludes a picked question’s adjacency partners', () => {
    const situationIdByQuestionId = new Map([
      ['q1', 'A'],
      ['q2', 'B'],
      ['q3', 'C'],
    ])
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'exact_match' },
    ])
    const tracker = createSituationExclusionTracker({ situationIdByQuestionId, adjacency })
    expect(tracker.isExcluded('q2')).toBe(false)
    tracker.excludeAfterPick('q1')
    expect(tracker.isExcluded('q2')).toBe(true)
    expect(tracker.isExcluded('q3')).toBe(false)
  })

  it('honors preExcludedSituations from the start', () => {
    const situationIdByQuestionId = new Map([['q1', 'A']])
    const adjacency = new Map<string, Set<string>>()
    const tracker = createSituationExclusionTracker({
      situationIdByQuestionId,
      adjacency,
      preExcludedSituations: ['A'],
    })
    expect(tracker.isExcluded('q1')).toBe(true)
  })

  it('never excludes anything when adjacency is built only from similar_concept matches', () => {
    const situationIdByQuestionId = new Map([
      ['q1', 'A'],
      ['q2', 'B'],
    ])
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'similar_concept' },
    ])
    const tracker = createSituationExclusionTracker({ situationIdByQuestionId, adjacency })
    tracker.excludeAfterPick('q1')
    expect(tracker.isExcluded('q2')).toBe(false)
  })
})

describe('trailingWindowSituations', () => {
  it('returns exactly 34 entries for minGap=35', () => {
    const cumulative = Array.from({ length: 100 }, (_, i) => `S${i}`)
    const window = trailingWindowSituations(cumulative, MIN_SITUATION_GAP)
    expect(window).toHaveLength(34)
    expect(window).toEqual(cumulative.slice(-34))
  })

  it('returns the whole array when shorter than the window, with no padding', () => {
    const cumulative = ['S1', 'S2', 'S3']
    expect(trailingWindowSituations(cumulative, 35)).toEqual(cumulative)
  })

  it('returns an empty array for an empty cumulative sequence', () => {
    expect(trailingWindowSituations([], 35)).toEqual([])
  })
})

describe('computeBlanketExclusion', () => {
  it('excludes partners of window situations, not the window situations themselves', () => {
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'exact_match' },
    ])
    const excluded = computeBlanketExclusion(['A'], adjacency)
    expect(excluded.has('B')).toBe(true)
    expect(excluded.has('A')).toBe(false)
  })

  it('leaves situations outside the window untouched', () => {
    const adjacency = buildSuppressionAdjacency([
      { situation_id_a: 'A', situation_id_b: 'B', match_type: 'exact_match' },
      { situation_id_a: 'C', situation_id_b: 'D', match_type: 'exact_match' },
    ])
    const excluded = computeBlanketExclusion(['A'], adjacency)
    expect(excluded.has('D')).toBe(false)
  })
})
