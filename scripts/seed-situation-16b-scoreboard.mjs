import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_ID = '8c5875c3-9759-4ca7-a6bc-d6501b8789a8'

// Situation 16B — Rule 16.2 goal, least-time release
// Source: NHL Situation Handbook 2025-26, p. 49
// A#42 double minor at 3:18 → serving 2nd portion (1:34 left) when goal scored at 0:52
// A#16 minor + USC at 1:27 → clock shows 3:25, first minor has 1:25 left (< 1:34) → released → 2:00
const question = {
  situation_id: '16B',
  handbook_section: 'Section 4 – Types of Penalties',
  category: 'Minor Penalties',
  rule_references: ['16.2'],
  rule_number: '16.2',
  question_type: 'scoreboard',
  league: 'NHL',
  text: 'With 3:22 remaining in the 3rd period, A #42 is assessed a Double Minor penalty. At 1:27 remaining, A #16 is assessed a Minor penalty and an Unsportsmanlike Conduct penalty. The non-penalized team scores a goal at 0:52 remaining. What are the correct times to communicate to the timekeeper?',
  answer_type: 'multiple_choice',
  options: [],
  correct_answers: [],
  rationale: 'Under Rule 16.2, when a goal is scored by the non-penalized team, the penalized player whose penalty has the LEAST time remaining is released. A #42 is serving the second portion of the double minor with 1:34 remaining. A #16\'s clock shows 3:25, but their first minor only has 1:25 remaining (3:25 − 2:00). Since 1:25 < 1:34, A #16\'s first minor is released — their clock drops to 2:00. A #42 remains at 1:34.',
  sub_questions: [{
    period: 3,
    start_gt: 202, // 3:22
    events: [
      {
        gt: 198, // 3:18
        type: 'penalty',
        team: 'A',
        player: '42',
        penalties: [{ penalty_type: 'double_minor', infraction: 'High Sticking' }],
      },
      {
        gt: 87, // 1:27
        type: 'penalty',
        team: 'A',
        player: '16',
        penalties: [
          { penalty_type: 'minor', infraction: 'Holding' },
          { penalty_type: 'minor', infraction: 'Unsportsmanlike Conduct' },
        ],
      },
      {
        gt: 52, // 0:52
        type: 'goal',
        team: 'B',
        player: '',
        penalties: [],
      },
    ],
    player_answers: [
      { team: 'A', player: '42', correct_secs: 94, wash_out: false, already_expired: false },  // 1:34
      { team: 'A', player: '16', correct_secs: 120, wash_out: false, already_expired: false }, // 2:00
    ],
  }],
  is_approved: true,
  created_by: ADMIN_ID,
}

const { data, error } = await supabase.from('questions').insert(question).select('id').single()

if (error) {
  console.error('Insert failed:', error.message)
  process.exit(1)
}

console.log('Inserted Situation 16B scoreboard question, id:', data.id)
