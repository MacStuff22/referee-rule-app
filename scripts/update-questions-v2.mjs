/**
 * Run AFTER the supabase-migration-v2.sql has been applied.
 * Updates all 40 existing questions with:
 *   - handbook_section (derived from rule number)
 *   - category (aligned to rule name)
 *   - situation_id (filled where known)
 *   - rule_references (properly formatted array)
 *   - is_approved = false (belt-and-suspenders after SQL migration)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Maps the primary rule number (as stored in DB) → correct metadata
// Keys must match what's currently in the rule_number column
const UPDATES = [
  // ─── First batch (questions from last session) ──────────────────────────
  {
    match: { text_prefix: 'The game clock shows time has expired' },
    situation_id: '4A',
    handbook_section: 'Section 1 – Playing Area',
    category: 'Signal and Timing Devices',
    rule_references: ['4.3'],
  },
  {
    match: { text_prefix: 'A player loses his helmet during play and changes on the fly' },
    situation_id: '9B',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9.6'],
  },
  {
    match: { text_prefix: 'Team A is on a breakaway. The opposing goalkeeper comes out of his crease and deliberately removes' },
    situation_id: '9F',
    handbook_section: 'Section 3 – Equipment',
    category: 'Uniforms / Player Equipment',
    rule_references: ['9.6'],
  },
  {
    match: { text_prefix: 'A minor penalty is being signaled against Team A #44. His teammate, Team A #16' },
    situation_id: '15A',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Calling of Penalties',
    rule_references: ['15.1 P.2', '39.1', '63.2(ii)'],
  },
  {
    match: { text_prefix: 'A delayed penalty is signaled on Team A. While Team B has control of the puck, the whistle is blown for an intentional off-side' },
    situation_id: '15B',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Calling of Penalties',
    rule_references: ['83.6(ii)', '76.2', '15.5'],
  },
  {
    match: { text_prefix: "Team A's goalkeeper has been removed for an extra attacker. A delayed minor penalty is signaled on Team A" },
    situation_id: '15C',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Calling of Penalties',
    rule_references: ['15.2', '16.2', '25.1', '25.3'],
  },
  {
    match: { text_prefix: 'When a goal is awarded to a team that is on the power play' },
    situation_id: '16C',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Minor Penalties',
    rule_references: ['16.2 P.3'],
  },
  {
    match: { text_prefix: 'Team A scores on a Penalty Shot while already on the power play' },
    situation_id: '16D',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Minor Penalties',
    rule_references: ['16.2 P.4', '24.6 P.4'],
  },
  {
    match: { text_prefix: 'A team commits a second face-off violation and is assessed a bench minor penalty' },
    situation_id: '17C',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Bench Minor Penalties',
    rule_references: ['17.1', '76.6 P.2'],
  },
  {
    match: { text_prefix: 'How many infractions carry a double-minor penalty as an option' },
    situation_id: '18A',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Double-Minor Penalties',
    rule_references: ['18', 'Table 4'],
  },
  {
    match: { text_prefix: 'With 4:59 remaining in the third period, Team A is assessed a major penalty and Team B is assessed a minor' },
    situation_id: '19H',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Coincidental Penalties',
    rule_references: ['19.4', '76.2 P.4'],
  },
  {
    match: { text_prefix: 'Coincidental minor penalties are running for Team A #8 and Team B #7' },
    situation_id: '19K',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Coincidental Penalties',
    rule_references: ['19.1', 'Table 16 Ex. G4'],
  },
  {
    match: { text_prefix: "A major penalty expires but the Coach forgot to place a substitute player" },
    situation_id: '20B',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Major Penalties',
    rule_references: ['20.3 P.3'],
  },
  {
    match: { text_prefix: 'A Referee assesses a major penalty to a player. After reviewing the video' },
    situation_id: '20C',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Major Penalties',
    rule_references: ['20.6 P.4'],
  },
  {
    match: { text_prefix: "Team A scores a goal. Before the next face-off, Team B informs the Referee that Team A #48" },
    situation_id: '5B',
    handbook_section: 'Section 2 – Teams',
    category: 'Teams',
    rule_references: ['5.2'],
  },
  {
    match: { text_prefix: 'Team A scores a goal on the first shift of the game. Before the next face-off, Team B notifies the Referee that Team A has the wrong starting goalkeeper' },
    situation_id: '7B',
    handbook_section: 'Section 2 – Teams',
    category: 'Starting Line-up',
    rule_references: ['7.2'],
  },
  {
    match: { text_prefix: 'Team A #4 is high-sticked in the face. A delayed penalty is signaled' },
    situation_id: '8L',
    handbook_section: 'Section 2 – Teams',
    category: 'Injured Players',
    rule_references: ['8.1'],
  },
  {
    match: { text_prefix: 'Can a goalkeeper be changed "on the fly"' },
    situation_id: '8H',
    handbook_section: 'Section 2 – Teams',
    category: 'Injured Players',
    rule_references: ['8.2', '74.1'],
  },
  {
    match: { text_prefix: 'A team wishes to designate two co-Captains for the game' },
    situation_id: '6A',
    handbook_section: 'Section 2 – Teams',
    category: 'Captain / Alternate Captains',
    rule_references: ['6'],
  },
  {
    match: { text_prefix: 'TRUE OR FALSE: Any player who is assessed a second 10-minute misconduct' },
    situation_id: '22B',
    handbook_section: 'Section 4 – Types of Penalties',
    category: 'Misconduct Penalties',
    rule_references: ['22'],
  },
  // ─── Second batch (questions from earlier session, situation_id unknown) ──
  {
    match: { text_prefix: 'During the first period of overtime in the playoffs, Team A is serving a minor penalty. The clock stops with 9:58' },
    situation_id: '1A',
    handbook_section: 'Section 1 – Playing Area',
    category: 'Rink',
    rule_references: ['1.10(iv)'],
  },
  // Leave remaining second-batch questions with auto-derived section/category;
  // situation_id will be left blank for the user to fill in during review.
]

// Auto-derive handbook_section and category from rule number for any question
// not explicitly listed above
function deriveSection(ruleStr) {
  const n = parseFloat(ruleStr)
  if (n >= 1 && n < 5) return 'Section 1 – Playing Area'
  if (n >= 5 && n < 9) return 'Section 2 – Teams'
  if (n >= 9 && n < 15) return 'Section 3 – Equipment'
  if (n >= 15 && n < 30) return 'Section 4 – Types of Penalties'
  if (n >= 30 && n < 41) return 'Section 5 – Officials'
  if (n >= 41 && n < 54) return 'Section 6 – Physical Infractions'
  if (n >= 54 && n < 58) return 'Section 7 – Restraining Infractions'
  if (n >= 58 && n < 63) return 'Section 8 – Stick Infractions'
  if (n >= 63 && n < 76) return 'Section 9 – Other Infractions'
  if (n >= 76 && n < 88) return 'Section 10 – Game Flow'
  return ''
}

const RULE_CATEGORY_MAP = {
  '1': 'Rink', '2': 'Goal Posts and Nets', '3': 'Benches', '4': 'Signal and Timing Devices',
  '5': 'Teams', '6': 'Captain / Alternate Captains', '7': 'Starting Line-up', '8': 'Injured Players',
  '9': 'Uniforms / Player Equipment', '10': 'Sticks', '11': 'Goalkeeper Equipment',
  '12': 'Illegal Equipment', '13': 'Puck', '14': 'Equipment Adjustment',
  '15': 'Calling of Penalties', '16': 'Minor Penalties', '17': 'Bench Minor Penalties',
  '18': 'Double-Minor Penalties', '19': 'Coincidental Penalties', '20': 'Major Penalties',
  '21': 'Match Penalties', '22': 'Misconduct Penalties', '23': 'Game Misconduct Penalties',
  '24': 'Penalty Shot', '25': 'Awarded Goals', '26': 'Delayed Penalties',
  '27': 'Goalkeeper Penalties', '28': 'Supplementary Discipline', '29': 'Signals',
  '30': 'Referees', '31': 'Referees', '32': 'Linespersons', '33': 'In-Arena Scorer',
  '34': 'Game Timekeeper', '35': 'Penalty Timekeeper', '36': 'Real Time Scorers',
  '37': 'Video Review', '38': "Coach's Challenge", '39': 'Abuse of Officials',
  '40': 'Physical Abuse of Officials', '41': 'Boarding', '42': 'Charging',
  '43': 'Checking from Behind', '44': 'Clipping', '45': 'Elbowing', '46': 'Fighting',
  '47': 'Head-butting', '48': 'Illegal Check to the Head', '49': 'Kicking',
  '50': 'Kneeing', '51': 'Roughing', '52': 'Slew-footing', '53': 'Throwing Equipment',
  '54': 'Holding', '55': 'Hooking', '56': 'Interference', '57': 'Tripping',
  '58': 'Butt-ending', '59': 'Cross-checking', '60': 'High-sticking', '61': 'Slashing',
  '62': 'Spearing', '63': 'Delaying the Game', '64': 'Diving / Embellishment',
  '65': 'Equipment Violation', '66': 'Forfeit of Game', '67': 'Handling Puck',
  '68': 'Illegal Substitution', '69': 'Interference on Goalkeeper', '70': 'Leaving the Bench',
  '71': 'Premature Substitution', '72': 'Refusing to Play / Start', '73': 'Refusing to Play / Start',
  '74': 'Too Many Men on the Ice', '75': 'Unsportsmanlike Conduct', '76': 'Face-offs',
  '77': 'Game and Intermission Timing', '78': 'Goals', '79': 'Hand Pass',
  '80': 'High-sticking the Puck', '81': 'Icing', '82': 'Line Changes',
  '83': 'Off-side', '84': 'Overtime', '85': 'Puck Out of Bounds',
  '86': 'Start of Game / Periods', '87': 'Time-outs',
}

function deriveCategory(ruleStr) {
  const n = Math.floor(parseFloat(ruleStr)).toString()
  return RULE_CATEGORY_MAP[n] ?? ''
}

async function run() {
  const { data: questions, error } = await supabase.from('questions').select('id, text, rule_number')
  if (error) { console.error(error); process.exit(1) }

  console.log(`Updating ${questions.length} questions…\n`)
  let updated = 0

  for (const q of questions) {
    // Find explicit update config
    const config = UPDATES.find((u) => q.text.startsWith(u.match.text_prefix))

    const payload = {
      is_approved: false,
      handbook_section: config?.handbook_section ?? deriveSection(q.rule_number),
      category: config?.category ?? deriveCategory(q.rule_number),
      situation_id: config?.situation_id ?? '',
      rule_references: config?.rule_references ?? (q.rule_number ? [q.rule_number] : []),
    }

    // Keep rule_number in sync with first reference
    if (payload.rule_references.length > 0) {
      payload.rule_number = payload.rule_references[0]
    }

    const { error: err } = await supabase.from('questions').update(payload).eq('id', q.id)
    if (err) {
      console.error(`  ✗ ${q.id}: ${err.message}`)
    } else {
      updated++
      console.log(`  ✓ [${(payload.situation_id || '??').padEnd(4)}] ${q.text.slice(0, 60)}`)
    }
  }

  console.log(`\nDone. ${updated}/${questions.length} questions updated.`)
}

run()
