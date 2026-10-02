/**
 * Demo history for the dashboard: ~12 weeks of realistic quiz sessions/answers
 * (and matching category mastery) for the claude-test-user account ONLY.
 * Nothing is written for any other user. Re-running replaces the demo history.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-dashboard-demo.mjs           # (re)seed
 *   node --env-file=.env.local scripts/seed-dashboard-demo.mjs --clear   # remove the demo history
 *
 * Lives in the same database as real users (see CLAUDE.md, "Testing as a
 * logged-in user"), so it refuses to touch any account except the test one.
 */

import { createClient } from '@supabase/supabase-js'

const TEST_EMAIL = 'claude-test-user@referee-rule-app.test'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (usersError) throw usersError
const user = users.users.find((u) => u.email?.toLowerCase() === TEST_EMAIL)
if (!user) throw new Error(`${TEST_EMAIL} not found. Run scripts/setup-test-accounts.mjs first.`)

// Cascades to quiz_answers.
const { error: delSessions } = await supabase.from('quiz_sessions').delete().eq('user_id', user.id)
if (delSessions) throw delSessions
const { error: delMastery } = await supabase.from('user_category_mastery').delete().eq('user_id', user.id)
if (delMastery) throw delMastery
console.log('Cleared existing demo history for the test user.')
if (process.argv.includes('--clear')) process.exit(0)

const { data: questions, error: qError } = await supabase
  .from('questions')
  .select('id, category')
  .eq('is_approved', true)
if (qError) throw qError
if (questions.length < 50) throw new Error('Not enough approved questions to build a demo history.')

// Deterministic randomness so reruns look the same.
let seed = 42
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const shuffle = (arr) => arr.map((v) => [rnd(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1])

const categories = [...new Set(questions.map((q) => q.category))]
const weakCats = new Set(shuffle(categories).slice(0, 4)) // topics the demo user struggles with
const byCat = new Map(categories.map((c) => [c, questions.filter((q) => q.category === c)]))
// A few questions the demo user keeps missing, across sessions.
const stubborn = shuffle(questions).slice(0, 3).map((q) => q.id)

const DAY = 86_400_000
const now = Date.now()
const WEEKS = 12
const mastery = new Map() // category -> { ema, total, last }

let sessionsMade = 0
let answersMade = 0
for (let daysAgo = WEEKS * 7; daysAgo >= 0; daysAgo--) {
  const weekIdx = (WEEKS * 7 - daysAgo) / 7 // 0 -> 12, improving over time
  const isWeekend = [0, 6].includes(new Date(now - daysAgo * DAY).getDay())
  const studyChance = 0.3 + weekIdx * 0.045 - (isWeekend ? 0.2 : 0)
  // a clear recent streak, and one gap earlier to show forgiveness
  const forced = daysAgo >= 1 && daysAgo <= 9
  if (!forced && rnd() > studyChance) continue

  const count = rnd() < 0.2 ? 17 : rnd() < 0.5 ? 7 : 10
  const startedAt = new Date(now - daysAgo * DAY)
  startedAt.setUTCHours(16 + Math.floor(rnd() * 4), Math.floor(rnd() * 60), 0, 0) // late morning/afternoon Eastern

  const chosen = new Set()
  if (daysAgo % 6 === 0) chosen.add(stubborn[Math.floor(rnd() * stubborn.length)])
  while (chosen.size < count) chosen.add(pick(questions).id)
  const ids = [...chosen]

  const { data: session, error: sErr } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: user.id,
      session_length: count === 17 ? 'standard' : 'quick',
      question_ids: ids,
      current_index: ids.length,
      started_at: startedAt.toISOString(),
      completed_at: new Date(startedAt.getTime() + count * 45_000).toISOString(),
    })
    .select('id')
    .single()
  if (sErr) throw sErr
  sessionsMade++

  const rows = ids.map((id, i) => {
    const q = questions.find((x) => x.id === id)
    const base = 0.58 + weekIdx * 0.025
    const p = stubborn.includes(id) ? 0.1 : weakCats.has(q.category) ? base - 0.3 : base
    const isCorrect = rnd() < Math.max(0.05, Math.min(0.97, p))
    const answeredAt = new Date(startedAt.getTime() + (i + 1) * 40_000)
    const m = mastery.get(q.category) ?? { ema: 0.5, total: 0, last: null }
    m.ema += 0.2 * ((isCorrect ? 1 : 0) - m.ema)
    m.total++
    m.last = answeredAt
    mastery.set(q.category, m)
    return {
      session_id: session.id,
      question_id: id,
      selected_answers: [0],
      is_correct: isCorrect,
      answered_at: answeredAt.toISOString(),
    }
  })
  const { error: aErr } = await supabase.from('quiz_answers').insert(rows)
  if (aErr) throw aErr
  answersMade += rows.length
}

const masteryRows = [...mastery.entries()].map(([category, m]) => ({
  user_id: user.id,
  category,
  ema_score: Number(m.ema.toFixed(4)),
  total_answered: m.total,
  last_answered_at: m.last.toISOString(),
  refresh_interval_days: 14,
}))
const { error: mErr } = await supabase.from('user_category_mastery').insert(masteryRows)
if (mErr) throw mErr

console.log(`Seeded ${sessionsMade} sessions, ${answersMade} answers, ${masteryRows.length} category mastery rows for ${TEST_EMAIL}.`)
console.log('Remove with: node --env-file=.env.local scripts/seed-dashboard-demo.mjs --clear')
