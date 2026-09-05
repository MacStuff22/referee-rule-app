import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { weightForCategory, MASTERY_CONFIG, type CategoryMasteryRow } from '@/lib/quiz/mastery'
import { remainingScheduledDays, reflowPace, reservedCoverageSlots, computeTargetEndDate } from '@/lib/quiz/paths'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import { weightedSampleWithoutReplacement } from '@/lib/quiz/sampling'
import {
  getAllSuppressionMatches,
  buildSuppressionAdjacency,
  createSituationExclusionTracker,
  trailingWindowSituations,
  computeBlanketExclusion,
} from '@/lib/situationMatches'

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

interface Params {
  params: Promise<{ pathId: string }>
}

export async function POST(request: Request, { params }: Params) {
  const { pathId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: path } = await supabase
    .from('quiz_paths')
    .select('*')
    .eq('id', pathId)
    .eq('user_id', user.id)
    .single()

  if (!path) return NextResponse.json({ error: 'Path not found' }, { status: 404 })
  if (path.status !== 'active') return NextResponse.json({ error: 'Path is not active' }, { status: 400 })

  // Resume an already-started-but-unfinished session for this path rather
  // than building a second one on top of it.
  const { data: inProgress } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('path_id', pathId)
    .eq('user_id', user.id)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (inProgress) return NextResponse.json({ sessionId: inProgress.id })

  // "Covered" = presented in a completed session of this path. Restricting
  // to currently-approved questions lets the pool self-heal if a question
  // is later unapproved, instead of getting permanently stuck as uncovered.
  const poolIds: string[] = path.pool_question_ids
  let liveQuestions
  try {
    liveQuestions = await fetchLivePoolQuestions(supabase, poolIds)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load this plan\'s questions.' }, { status: 500 })
  }

  const categoryById = new Map(liveQuestions.map((q) => [q.id, q.category]))
  const situationIdById = new Map(liveQuestions.map((q) => [q.id, q.situation_id]))
  const livePoolIds = liveQuestions.map((q) => q.id)

  // Ordered ascending so concatenating question_ids below reflects the
  // actual chronological sequence of questions seen across this path's days
  // — needed to compute the cumulative-position gap for situation matches.
  const { data: completedSessions } = await supabase
    .from('quiz_sessions')
    .select('question_ids')
    .eq('path_id', pathId)
    .eq('user_id', user.id)
    .not('completed_at', 'is', null)
    .order('started_at', { ascending: true })

  const covered = new Set<string>()
  for (const s of completedSessions ?? []) {
    for (const id of (s.question_ids as string[]) ?? []) covered.add(id)
  }

  const uncoveredPool = livePoolIds.filter((id) => !covered.has(id))

  const now = new Date()

  if (uncoveredPool.length === 0) {
    await supabase.from('quiz_paths').update({ status: 'completed' }).eq('id', pathId)
    return NextResponse.json({ completed: true })
  }

  // Reflow the pace every time — this both catches up a missed day and
  // relaxes pace if the user is ahead, rather than only reacting to misses.
  const remaining = remainingScheduledDays(now, new Date(path.target_end_date), path.days_per_week)
  const reflow = reflowPace(uncoveredPool.length, remaining, path.questions_per_day)

  const updates: Record<string, string | number> = {}
  if (reflow.questionsPerDay !== path.questions_per_day) updates.questions_per_day = reflow.questionsPerDay
  if (reflow.extendEndDate) {
    updates.target_end_date = computeTargetEndDate(uncoveredPool.length, reflow.questionsPerDay, now, path.days_per_week)
      .toISOString()
      .slice(0, 10)
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from('quiz_paths').update(updates).eq('id', pathId)
  }

  // Matched questions (exact/very-similar situations) get a real minimum-
  // 35-question gap across the whole path, not just within one day — so the
  // exclusion state is seeded from the trailing window of the path's
  // cumulative history, then shared across BOTH the reserved and fill picks
  // below via one tracker instance (a pick in either call excludes its
  // partner from the other). Exclusion happens at pick time, before the
  // final shuffle, so it holds regardless of shuffle order.
  const suppressionMatches = await getAllSuppressionMatches(supabase)
  const adjacency = buildSuppressionAdjacency(suppressionMatches)
  const cumulativeSituations = (completedSessions ?? [])
    .flatMap((s) => (s.question_ids as string[]) ?? [])
    .map((id) => situationIdById.get(id))
    .filter((s): s is string => !!s)
  const preExcluded = computeBlanketExclusion(trailingWindowSituations(cumulativeSituations), adjacency)
  const tracker = createSituationExclusionTracker({
    situationIdByQuestionId: situationIdById,
    adjacency,
    preExcludedSituations: preExcluded,
  })
  const sampleOptions = { isExcluded: tracker.isExcluded, onPick: tracker.excludeAfterPick }

  const todaysTarget = Math.min(reflow.questionsPerDay, livePoolIds.length)
  const reservedCount = reservedCoverageSlots(uncoveredPool.length, remaining, todaysTarget)
  const reservedIds = weightedSampleWithoutReplacement(
    uncoveredPool.map((id) => ({ id, weight: 1 })),
    reservedCount,
    sampleOptions
  )
  const reservedSet = new Set(reservedIds)

  // Mastery + within-path repeat cooldown drive the rest of the day's slots.
  const { data: masteryRows } = await supabase
    .from('user_category_mastery')
    .select('category, ema_score, total_answered, last_answered_at, refresh_interval_days')
    .eq('user_id', user.id)

  const masteryByCategory = new Map<string, CategoryMasteryRow>((masteryRows ?? []).map((r) => [r.category, r]))

  const { data: pathSessions } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('path_id', pathId)
    .eq('user_id', user.id)

  const pathSessionIds = (pathSessions ?? []).map((s) => s.id)
  const cooldownCutoff = new Date(now.getTime() - MASTERY_CONFIG.repeatCooldownDays * 86_400_000)
  const recentlyInPath = new Set<string>()
  if (pathSessionIds.length > 0) {
    const { data: recentAnswers } = await supabase
      .from('quiz_answers')
      .select('question_id')
      .in('session_id', pathSessionIds)
      .gte('answered_at', cooldownCutoff.toISOString())
    for (const a of recentAnswers ?? []) recentlyInPath.add(a.question_id)
  }

  const fillCandidates = livePoolIds
    .filter((id) => !reservedSet.has(id))
    .map((id) => {
      let weight = weightForCategory(masteryByCategory.get(categoryById.get(id) ?? ''), now)
      if (recentlyInPath.has(id)) weight *= MASTERY_CONFIG.repeatCooldownMultiplier
      return { id, weight }
    })

  const fillCount = Math.max(0, todaysTarget - reservedIds.length)
  const fillIds = weightedSampleWithoutReplacement(fillCandidates, fillCount, sampleOptions)

  const sessionQuestionIds = shuffle([...reservedIds, ...fillIds])

  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id,
      session_length: 'path',
      path_id: pathId,
      question_ids: sessionQuestionIds,
      current_index: 0,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessionId: session.id })
}
