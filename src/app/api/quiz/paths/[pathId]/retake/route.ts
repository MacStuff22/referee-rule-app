import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchLivePoolQuestions } from '@/lib/quiz/pool'
import { getLatestAnswers, getPathAnswers } from '@/lib/quiz/pathProgress'
import { defaultRetakeSize, retakeSizeOptions, stillMissedQuestions } from '@/lib/quiz/pathReport'
import { weightedSampleWithoutReplacement } from '@/lib/quiz/sampling'
import {
  getAllSuppressionMatches,
  buildSuppressionAdjacency,
  createSituationExclusionTracker,
} from '@/lib/situationMatches'

interface Params {
  params: Promise<{ pathId: string }>
}

/**
 * Builds a quiz from the questions a finished plan's user is still getting
 * wrong. It is deliberately NOT tied to the plan (no path_id): the plan's
 * coverage, accuracy, study days and finish date are a record of the plan
 * itself, and a retake that wrote into them would rewrite the report.
 */
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
  if (path.status !== 'completed') return NextResponse.json({ error: 'Finish the plan first' }, { status: 400 })

  const body = await request.json().catch(() => null)

  let liveQuestions
  let planAnswers
  let latestAnswers
  try {
    liveQuestions = await fetchLivePoolQuestions(supabase, path.pool_question_ids)
    planAnswers = await getPathAnswers(supabase, pathId, user.id)
    latestAnswers = await getLatestAnswers(supabase, user.id, liveQuestions.map((q) => q.id))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load this plan.' }, { status: 500 })
  }

  const missed = stillMissedQuestions({
    poolQuestionIds: liveQuestions.map((q) => q.id),
    latestAnswers,
    planAnswers,
  })
  if (missed.length === 0) return NextResponse.json({ error: 'Nothing left to retake' }, { status: 400 })

  // Never trust the size from the client: whole numbers only, within what the stepper offers.
  const options = retakeSizeOptions(missed.length)
  const requested = Number.isInteger(body?.count) ? (body.count as number) : defaultRetakeSize(options)
  const count = Math.min(Math.max(requested, 1), options[options.length - 1])

  // Questions missed more than once in the plan are likelier to be picked.
  const situationIdByQuestionId = new Map(liveQuestions.map((q) => [q.id, q.situation_id]))
  const adjacency = buildSuppressionAdjacency(await getAllSuppressionMatches(supabase))
  const tracker = createSituationExclusionTracker({ situationIdByQuestionId, adjacency })
  const questionIds = weightedSampleWithoutReplacement(
    missed.map((m) => ({ id: m.questionId, weight: m.misses })),
    count,
    { isExcluded: tracker.isExcluded, onPick: tracker.excludeAfterPick }
  )

  // session_length is only a label (a check constraint allows quick, standard, full, path) and nothing reads it back.
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id,
      session_length: 'quick',
      question_ids: questionIds,
      current_index: 0,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessionId: session.id })
}
