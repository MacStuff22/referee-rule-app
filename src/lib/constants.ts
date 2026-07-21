// ============================================================
// Shared taxonomy: handbook sections + question categories
//
// Single source of truth for the lists that were previously duplicated in
// the question form and the admin questions list. Update here and every
// screen (editor, filters) stays in sync.
// ============================================================

export const HANDBOOK_SECTIONS = [
  'Section 1 – Playing Area',
  'Section 2 – Teams',
  'Section 3 – Equipment',
  'Section 4 – Types of Penalties',
  'Section 5 – Officials',
  'Section 6 – Physical Infractions',
  'Section 7 – Restraining Infractions',
  'Section 8 – Stick Infractions',
  'Section 9 – Other Infractions',
  'Section 10 – Game Flow',
  'Miscellaneous',
] as const

export const CATEGORIES = [
  // Section 1 – Playing Area
  'Rink',
  'Goal Posts and Nets',
  'Benches',
  'Signal and Timing Devices',
  // Section 2 – Teams
  'Teams',
  'Captain / Alternate Captains',
  'Starting Line-up',
  'Injured Players',
  // Section 3 – Equipment
  'Uniforms / Player Equipment',
  'Sticks',
  'Goalkeeper Equipment',
  'Illegal Equipment',
  'Puck',
  'Equipment Adjustment',
  // Section 4 – Types of Penalties
  'Calling of Penalties',
  'Minor Penalties',
  'Bench Minor Penalties',
  'Double-Minor Penalties',
  'Coincidental Penalties',
  'Major Penalties',
  'Match Penalties',
  'Misconduct Penalties',
  'Game Misconduct Penalties',
  'Penalty Shot',
  'Awarded Goals',
  'Delayed Penalties',
  'Goalkeeper Penalties',
  'Supplementary Discipline',
  'Signals',
  // Section 5 – Officials
  'Referees',
  'Linespersons',
  'In-Arena Scorer',
  'Game Timekeeper',
  'Penalty Timekeeper',
  'Real Time Scorers',
  'Video Review',
  "Coach's Challenge",
  'Abuse of Officials',
  'Physical Abuse of Officials',
  // Section 6 – Physical Infractions
  'Boarding',
  'Charging',
  'Checking from Behind',
  'Clipping',
  'Elbowing',
  'Fighting',
  'Head-butting',
  'Illegal Check to the Head',
  'Kicking',
  'Kneeing',
  'Roughing',
  'Slew-footing',
  'Throwing Equipment',
  // Section 7 – Restraining Infractions
  'Holding',
  'Hooking',
  'Interference',
  'Tripping',
  // Section 8 – Stick Infractions
  'Butt-ending',
  'Cross-checking',
  'High-sticking',
  'Slashing',
  'Spearing',
  // Section 9 – Other Infractions
  'Delaying the Game',
  'Diving / Embellishment',
  'Equipment Violation',
  'Forfeit of Game',
  'Handling Puck',
  'Illegal Substitution',
  'Interference on Goalkeeper',
  'Leaving the Bench',
  'Premature Substitution',
  'Refusing to Play / Start',
  'Too Many Men on the Ice',
  'Unsportsmanlike Conduct',
  // Section 10 – Game Flow
  'Face-offs',
  'Game and Intermission Timing',
  'Goals',
  'Hand Pass',
  'High-sticking the Puck',
  'Icing',
  'Line Changes',
  'Off-side',
  'Overtime',
  'Puck Out of Bounds',
  'Start of Game / Periods',
  'Time-outs',
  // Misc
  'Miscellaneous',
] as const
