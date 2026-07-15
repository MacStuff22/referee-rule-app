import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_ID = '8c5875c3-9759-4ca7-a6bc-d6501b8789a8'

const questions = [
  {
    situation_id: '15D',
    handbook_section: 'Section 5 – Officials',
    category: 'Calling of Penalties',
    rule_references: ['15.2'],
    rule_number: '15',
    text: 'A3 is about to be assessed a double-minor penalty for high-sticking. While this infraction is on delay, A12 crosschecks a Team B player and that penalty is also on delay. Team B scores while both infractions are on delay. What penalty or penalties are assessed?',
    answer_type: 'multiple_choice',
    options: [
      'Both penalties are washed out because Team B scored.',
      'The double-minor is assessed in full; A12\'s minor is washed out.',
      'Captain\'s choice: either serve A3\'s double-minor (A12\'s minor washed), or serve A12\'s minor plus one minor of A3\'s double-minor simultaneously (remaining minor washed).',
      'All penalties are assessed in full — one player shorthanded for four minutes, another for two.',
    ],
    correct_answers: [2],
    rationale: 'When Team B scores while multiple penalties are on delay, it is Captain\'s choice. Team A can choose to play one player shorthanded for four minutes (A3\'s double-minor; A12\'s minor washed), or play two players shorthanded for two minutes (A12\'s minor + one minor of A3\'s double-minor served simultaneously; remaining minor washed). Rule 15.2, paragraph 2.',
    question_type: 'situation',
    league: 'NHL',
    is_approved: false,
    sub_questions: [],
  },
  {
    situation_id: '15E',
    handbook_section: 'Section 5 – Officials',
    category: 'Calling of Penalties',
    rule_references: ['15.2', '15.4'],
    rule_number: '15',
    text: 'The Referee signals a delayed penalty against Team A #6 and is going to award a Penalty Shot as a result of that infraction. Before play is stopped, A#6 commits another infraction calling for a minor penalty. Team B scores before play is stopped. What is the Referee\'s decision?',
    answer_type: 'multiple_choice',
    options: [
      'Both the Penalty Shot and the minor penalty are washed out.',
      'The Penalty Shot is washed out; A#6 goes to the penalty box to serve his second minor penalty.',
      'The Penalty Shot is still awarded; the minor penalty is washed out.',
      'A#6 serves the minor penalty, and the Penalty Shot is taken after.',
    ],
    correct_answers: [1],
    rationale: 'The delayed minor penalty for which the Penalty Shot was to be awarded is washed out as a result of the goal by Team B. A#6 goes to the penalty box to serve his second minor penalty (the crosscheck/infraction committed while the penalty shot was pending). Rule 15.2 and Rule 15.4.',
    question_type: 'situation',
    league: 'NHL',
    is_approved: false,
    sub_questions: [],
  },
  {
    situation_id: '15F',
    handbook_section: 'Section 5 – Officials',
    category: 'Calling of Penalties',
    rule_references: ['15.2', '15.4'],
    rule_number: '15',
    text: 'Team A is serving a minor penalty. The Referee signals a delayed penalty calling for a Penalty Shot against a player on Team A. Team B scores a goal prior to the stoppage of play. What action is taken by the Referee?',
    answer_type: 'multiple_choice',
    options: [
      'The minor penalty being served continues; the Penalty Shot is washed out.',
      'Both the minor penalty and the Penalty Shot are cancelled as a result of the goal.',
      'The minor penalty expires on the goal; the infraction that triggered the Penalty Shot is now assessed and served as a regular penalty in the normal manner.',
      'The Penalty Shot is still taken after the goal; the minor penalty expires.',
    ],
    correct_answers: [2],
    rationale: 'The minor penalty being served expires on the scoring of the goal by Team B. The infraction that was originally going to result in a Penalty Shot is now assessed and served as a regular penalty (minor, double-minor, major, or match) in the normal manner. Rule 15.2 and 15.4, paragraph 3.',
    question_type: 'situation',
    league: 'NHL',
    is_approved: false,
    sub_questions: [],
  },
]

const { error } = await supabase.from('questions').insert(
  questions.map((q) => ({ ...q, created_by: ADMIN_ID }))
)

if (error) {
  console.error('Insert failed:', error.message)
  process.exit(1)
}

console.log('Inserted 15D, 15E, 15F successfully.')
