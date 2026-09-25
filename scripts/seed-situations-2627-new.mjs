/**
 * Adds the net-new situations introduced in the 26/27 Situation Handbook
 * (diffed against the 25/26 edition — see reference_pdfs memory for file
 * paths). These are genuinely new situations, not updates to existing ones,
 * so they're inserted as brand-new rows with is_approved: false for Morgan
 * to review in the admin pending queue.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_ID = '8c5875c3-9759-4ca7-a6bc-d6501b8789a8'

const questions = [
  {
    situation_id: '9Q',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9.5'],
    rule_number: '9.5',
    question_type: 'situation',
    text: "An on-ice official notices a player on the ice wearing equipment that isn't worn properly or isn't approved (e.g. a visor). What should the officials do?",
    answer_type: 'multiple_choice',
    options: [
      'At the next stoppage of play, advise the player to correct the issue; if he returns to the ice with the same issue, a minor penalty is assessed.',
      'Stop play immediately and assess a minor penalty.',
      'No action is required unless the equipment causes an injury.',
      'Assess a bench minor penalty to his team right away.',
    ],
    correct_answers: [0],
    rationale: 'At the next stoppage of play, the player must be advised to correct the issue. If he returns to the ice with the same issue, a minor penalty shall be assessed. Rule 9.5.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '9R',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9'],
    rule_number: '9',
    question_type: 'situation',
    text: 'The on-ice officials notice that a player (or goalkeeper) has lost his neck protection. How should they handle this?',
    answer_type: 'multiple_choice',
    options: [
      'At the next stoppage of play, the player must be notified to re-secure his neck protection; he cannot participate in play without it.',
      'Play must be stopped immediately to address the equipment issue.',
      'No action is required — neck protection is optional equipment.',
      'The player is assessed a minor penalty for the equipment violation right away.',
    ],
    correct_answers: [0],
    rationale: 'At the next stoppage of play, the player (or goalkeeper) must be notified to re-secure the neck protection. He cannot participate in the play without proper neck protection. Rule 9.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '9S',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9'],
    rule_number: '9',
    question_type: 'situation',
    text: "A player's (or goalkeeper's) neck protection comes loose or falls off during play. What should the on-ice officials do?",
    answer_type: 'multiple_choice',
    options: [
      'He may continue to play without it; once he leaves the ice or at the next stoppage of play, he must re-secure it and may not return without proper neck protection.',
      'Play is stopped immediately for the equipment issue.',
      'He must leave the ice immediately, regardless of the state of play.',
      'No action is needed for the remainder of the game.',
    ],
    correct_answers: [0],
    rationale: 'The player (or goalkeeper) may continue to play without it. Once he has left the ice, or at the next stoppage of play, he must re-secure the neck protection. He may not return to play without proper neck protection. Rule 9.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '9T',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9'],
    rule_number: '9',
    question_type: 'situation',
    text: 'Must all protective equipment be worn properly at all times, including during pre-game warm-up?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — all protective equipment and jerseys must be worn as designed at all times during the game, including pre-game warm-up.',
      'No — equipment requirements are relaxed during pre-game warm-up.',
    ],
    correct_answers: [0],
    rationale: 'All protective equipment, as well as jerseys, must be worn as outlined by the league and in the manner for which they were designed, at all times during the game, including during pre-game warm-up. Rule 9.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '37F',
    handbook_section: 'Section 5 – Officials',
    category: 'Video Review',
    rule_references: ['37.3(i)'],
    rule_number: '37.3(i)',
    question_type: 'situation',
    text: "An attacking player takes a shot on goal and the puck is still moving when the referee, having lost sight of it, blows his whistle just as the goalkeeper propels the moving puck across the line. What is the ruling?",
    answer_type: 'multiple_choice',
    options: [
      "Video review can rule this the culmination of a continuous play, unaffected by the referee's whistle, and the goal can count.",
      'The whistle immediately kills the play and no review can restore the goal.',
      'The goal counts automatically with no review needed, since the puck was already moving.',
      "The referee's on-ice call can only be reviewed if requested by a coach's challenge.",
    ],
    correct_answers: [0],
    rationale: 'This is subject to video review. The referee, in consultation with the NHL Situation Room, can rule that this was the culmination of a continuous play where the result was unaffected by any whistle blown by the referee. Rule 37.3(i).',
    league: ['NHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '38U',
    handbook_section: 'Section 5 – Officials',
    category: "Coach's Challenge",
    rule_references: ['38'],
    rule_number: '38',
    question_type: 'situation',
    text: "What is the result if a coach's challenge or video review cannot conclusively establish that the call on the ice was incorrect?",
    answer_type: 'multiple_choice',
    options: [
      'The original call on the ice is confirmed.',
      'The play is automatically overturned in favor of the challenging team.',
    ],
    correct_answers: [0],
    rationale: 'If a review or challenge cannot conclusively and irrefutably establish that the call on the ice was incorrect, the original call on the ice is confirmed. Rule 38.',
    league: ['NHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '76DDD',
    handbook_section: 'Section 10 – Game Flow',
    category: 'Face-offs',
    rule_references: ['76'],
    rule_number: '76',
    question_type: 'situation',
    text: 'The attacking center puts his stick down first in the white area of the face-off dot while in the attacking zone. Is this permitted?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — this is completely legal.',
      'No — the attacking center must let the defending center place his stick down first.',
    ],
    correct_answers: [0],
    rationale: 'Yes. This is completely legal. Rule 76.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
  {
    situation_id: '85JJ',
    handbook_section: 'Section 10 – Game Flow',
    category: 'Puck Out of Bounds',
    rule_references: ['85.1 P.5'],
    rule_number: '85.1 P.5',
    question_type: 'situation',
    text: "The puck is shot into the zone by the attacking team and goes out of play through an open camera hole. Where is the ensuing face-off?",
    answer_type: 'multiple_choice',
    options: [
      'At the nearest face-off spot in the zone where the puck went through the camera hole.',
      'At center ice.',
      "In the attacking team's defending zone, regardless of where the puck exited.",
      'At the neutral zone dot nearest the point of origin of the shot.',
    ],
    correct_answers: [0],
    rationale: 'The face-off takes place at the nearest face-off spot in the zone where the puck went through the camera hole. Rule 85.1, paragraph 5.',
    league: ['NHL', 'AHL'], is_approved: false, sub_questions: [],
  },
]

const { error } = await supabase.from('questions').insert(
  questions.map((q) => ({ ...q, created_by: ADMIN_ID }))
)

if (error) {
  console.error('Insert failed:', error.message)
  process.exit(1)
}

console.log(`Inserted ${questions.length} questions (9Q, 9R, 9S, 9T, 37F, 38U, 76DDD, 85JJ), all is_approved: false.`)
