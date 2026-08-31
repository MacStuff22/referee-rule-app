// Read-only audit: find questions that have blank answer option slots.
// Run with:  node --env-file=.env.local scripts/find-blank-options.mjs
//
// Makes NO changes to the database — it only reads and reports.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const supabase = createClient(url, key)

const isBlank = (s) => typeof s !== 'string' || s.trim() === ''
const letter = (i) => String.fromCharCode(65 + i)
const snippet = (t, n = 90) => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

// Fetch ALL rows (page through in case there are > 1000).
async function fetchAll() {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, text, situation_id, category, rule_number, question_type, answer_type, options, sub_questions, is_approved')
      .order('situation_id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const questions = await fetchAll()

const affected = []

for (const q of questions) {
  const problems = []

  // Standard questions: top-level options array.
  if (q.question_type !== 'compound' && q.question_type !== 'scoreboard') {
    const opts = Array.isArray(q.options) ? q.options : []
    const blanks = opts.map((o, i) => (isBlank(o) ? letter(i) : null)).filter(Boolean)
    if (blanks.length > 0) {
      problems.push({ where: 'options', slots: blanks, total: opts.length })
    }
  }

  // Compound questions: each sub-question has its own options.
  if (q.question_type === 'compound' && Array.isArray(q.sub_questions)) {
    q.sub_questions.forEach((sq, si) => {
      const opts = Array.isArray(sq?.options) ? sq.options : []
      const blanks = opts.map((o, i) => (isBlank(o) ? letter(i) : null)).filter(Boolean)
      if (blanks.length > 0) {
        problems.push({ where: `sub-question ${si + 1}`, slots: blanks, total: opts.length })
      }
    })
  }

  if (problems.length > 0) {
    affected.push({
      id: q.id,
      situation_id: q.situation_id || '—',
      question_type: q.question_type,
      category: q.category || '—',
      rule_number: q.rule_number || '—',
      is_approved: q.is_approved,
      text: snippet(q.text),
      problems,
    })
  }
}

// Sort by situation_id in a natural-ish way (number then letters).
affected.sort((a, b) => {
  const pa = String(a.situation_id).match(/^(\d+)([A-Za-z]*)$/)
  const pb = String(b.situation_id).match(/^(\d+)([A-Za-z]*)$/)
  if (pa && pb) {
    const dn = parseInt(pa[1]) - parseInt(pb[1])
    if (dn) return dn
    return pa[2].localeCompare(pb[2])
  }
  return String(a.situation_id).localeCompare(String(b.situation_id))
})

// ── Report ──
console.log('='.repeat(70))
console.log(`Scanned ${questions.length} questions total.`)
console.log(`Found ${affected.length} question(s) with blank answer slots.`)
console.log('='.repeat(70))

let totalBlankSlots = 0
for (const a of affected) {
  const parts = a.problems
    .map((p) => `${p.where}: blank ${p.slots.join(', ')} of ${p.total}`)
    .join('  |  ')
  a.problems.forEach((p) => (totalBlankSlots += p.slots.length))
  const flag = a.is_approved ? '' : '  (pending)'
  console.log(`\n[${a.situation_id}] ${a.question_type} · ${a.category} · Rule ${a.rule_number}${flag}`)
  console.log(`   "${a.text}"`)
  console.log(`   ${parts}`)
}

console.log('\n' + '='.repeat(70))
console.log(`Total blank slots across all questions: ${totalBlankSlots}`)
console.log('='.repeat(70))

// Machine-readable output for a possible follow-up fix.
writeFileSync('scripts/blank-options-report.json', JSON.stringify(affected, null, 2))
console.log('\nWrote scripts/blank-options-report.json')
