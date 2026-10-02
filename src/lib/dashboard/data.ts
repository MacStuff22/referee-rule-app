// ============================================================
// Dashboard data loader
//
// Fetches a user's raw history once and hands it to the pure functions in
// metrics.ts. quiz_answers has no user_id, so answers are fetched through
// an inner join on quiz_sessions (same pattern as getPathAnswers) rather
// than a giant .in(session_ids) list that can blow the request-line limit.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPathProgress, type PathProgress } from '@/lib/quiz/pathProgress'
import {
  biweeklyTrend,
  coverage,
  last30Days,
  milestones,
  missedQuestions,
  momentum,
  readiness,
  strengthMap,
  studyPlan,
  type AnswerRecord,
  type MasteryInfo,
  type QuestionMeta,
} from '@/lib/dashboard/metrics'
import type { QuizPath } from '@/types'

// Supabase returns at most 1000 rows per request, so page through.
const PAGE_SIZE = 1000

async function fetchAllAnswers(supabase: SupabaseClient, userId: string): Promise<AnswerRecord[]> {
  const out: AnswerRecord[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('quiz_answers')
      .select('id, question_id, session_id, is_correct, answered_at, quiz_sessions!inner(user_id)')
      .eq('quiz_sessions.user_id', userId)
      .order('answered_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Failed to load answer history: ${error.message}`)
    for (const row of data ?? []) {
      out.push({
        questionId: row.question_id as string,
        sessionId: row.session_id as string,
        isCorrect: row.is_correct as boolean,
        answeredAt: row.answered_at as string,
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}

async function fetchApprovedQuestions(supabase: SupabaseClient): Promise<QuestionMeta[]> {
  const out: QuestionMeta[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, category, rule_references')
      .eq('is_approved', true)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Failed to load questions: ${error.message}`)
    for (const row of data ?? []) {
      out.push({
        id: row.id as string,
        text: '', // filled in only for the few questions that get displayed
        category: row.category as string,
        ruleReferences: (row.rule_references as string[] | null) ?? [],
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}

export async function loadDashboard(supabase: SupabaseClient, userId: string, now: Date = new Date()) {
  const [answers, questions, masteryResult, pathsResult] = await Promise.all([
    fetchAllAnswers(supabase, userId),
    fetchApprovedQuestions(supabase),
    supabase
      .from('user_category_mastery')
      .select('category, ema_score, total_answered, last_answered_at, refresh_interval_days')
      .eq('user_id', userId),
    supabase.from('quiz_paths').select('*').eq('user_id', userId).eq('status', 'active').order('target_end_date'),
  ])

  const masteries: MasteryInfo[] = (masteryResult.data ?? []).map((r) => ({
    category: r.category as string,
    emaScore: Number(r.ema_score),
    totalAnswered: r.total_answered as number,
    lastAnsweredAt: r.last_answered_at as string | null,
    refreshIntervalDays: r.refresh_interval_days as number,
  }))

  const last30 = last30Days(answers, now)
  const cov = coverage(answers, questions, masteries, now)

  const missed = missedQuestions(answers, questions)
  if (missed.length > 0) {
    const { data: texts } = await supabase.from('questions').select('id, text').in('id', missed.map((m) => m.questionId))
    const textById = new Map((texts ?? []).map((t) => [t.id as string, t.text as string]))
    for (const m of missed) m.text = textById.get(m.questionId) ?? ''
  }

  const paths = (pathsResult.data ?? []) as QuizPath[]
  const plans: { path: QuizPath; progress: PathProgress }[] = []
  for (const path of paths.slice(0, 2)) {
    try {
      plans.push({ path, progress: await getPathProgress(supabase, path) })
    } catch {
      // A broken plan shouldn't take the whole dashboard down.
    }
  }

  return {
    hasHistory: answers.length > 0,
    totalAnswered: answers.length,
    last30,
    trend: biweeklyTrend(answers, now),
    coverage: cov,
    readiness: readiness(last30, cov, masteries, now),
    studyPlan: studyPlan(answers, questions, masteries, now),
    strengthMap: strengthMap(masteries, questions),
    momentum: momentum(answers, now),
    missed,
    milestones: milestones(answers, masteries),
    plans,
  }
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>
