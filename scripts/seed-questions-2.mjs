import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_ID = '8c5875c3-9759-4ca7-a6bc-d6501b8789a8'

const questions = [
  // Rule 1 – Rink
  {
    text: 'During the first period of overtime in the playoffs, Team A is serving a minor penalty. The clock stops with 9:58 remaining. The Zamboni gate opens and the ice crew comes onto the ice to shovel excess snow. Is this permitted?',
    answer_type: 'multiple_choice',
    options: [
      'No — the Zamboni gate must remain closed whenever a penalty is being served.',
      'Yes — this is permitted under the rules.',
      'Yes — but only if both teams agree to allow it.',
      'No — ice crew access is prohibited during overtime.',
    ],
    correct_answers: [1],
    rationale: 'Yes, this is permitted. Rule 1.10(iv) explicitly allows ice crew access under these circumstances.',
    rule_number: '1.10',
    league: 'NHL',
    category: 'Playing Area',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 5 – Team (5C)
  {
    text: 'At 12:00 in the second period, Team A scores a goal. At the stoppage, Team B claims that Team A #12 is not on the 18-skater list and was on the ice for the goal. Team B also mentions he received an assist on a goal in the first period. What is the Referee\'s decision?',
    answer_type: 'multiple_choice',
    options: [
      'Both goals are disallowed since #12 was ineligible all game.',
      'Only the second-period goal is disallowed; previous goals/assists by Team A while #12 was on the ice are allowed.',
      'Both goals stand; ineligibility only affects future play.',
      'Both goals are disallowed and #12 is suspended.',
    ],
    correct_answers: [1],
    rationale: 'Only the goal scored at the stoppage of play when the player was deemed ineligible is disallowed. All other goals previously scored by the ineligible player\'s team (with him on ice or not) shall be allowed. The ineligible player is removed from the game with no additional penalties.',
    rule_number: '5.2',
    league: 'NHL',
    category: 'Teams',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 5 – Team (5H)
  {
    text: 'Team A\'s starting goalkeeper is assessed a game misconduct early in the first period. The backup enters and sustains an injury in the second period and cannot continue. Team A has no third goalkeeper in the building. Can the first goalkeeper, who received the game misconduct, re-enter the game?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — an injury to the only remaining goalkeeper overrides the game misconduct.',
      'No — the first goalkeeper remains ineligible. Team A must dress one of the 18 skaters on the game line-up as goalkeeper.',
      'Yes — but only if the League office grants approval.',
      'No — Team A must forfeit the game.',
    ],
    correct_answers: [1],
    rationale: 'The first goalkeeper is ineligible due to the game misconduct penalty. Team A may dress any player listed on the 18-man game line-up to serve as goalkeeper for the remainder of the game.',
    rule_number: '5.3',
    league: 'NHL',
    category: 'Goalkeepers',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 6 – Captain (6B)
  {
    text: 'The In-Arena Scorer notifies the Referees prior to the start of the game that the Team A Coach has refused to name a Captain or Alternate Captains. What should the Referees do?',
    answer_type: 'multiple_choice',
    options: [
      'Assess a bench minor penalty to Team A for delay of game.',
      'Inform the Coach that if he refuses to name a Captain, Team A loses the right to have a spokesperson discuss issues with officials during the game.',
      'Forfeit Team A\'s choice of end to start the game.',
      'Nothing — naming a Captain and Alternates is optional.',
    ],
    correct_answers: [1],
    rationale: 'Refusing to designate a Captain carries no penalty, but the Referees should inform the Coach that by refusing, he relinquishes his team\'s right to have a spokesperson discuss issues with officials during the game. The matter must be reported to the League office.',
    rule_number: '6',
    league: 'NHL',
    category: 'Teams',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 7 – Starting Lineup (7A)
  {
    text: 'The puck is dropped to start the game. Team A scores on the first shift. Before the next face-off, Team B challenges Team A\'s starting line-up and the Referee discovers the Team A goalkeeper is not listed on the line-up sheet at all. What is the ruling?',
    answer_type: 'multiple_choice',
    options: [
      'Goal stands; bench minor assessed to Team A.',
      'Goal stands; no penalty since it was the officials\' responsibility to check.',
      'Goal is disallowed; Team A goalkeeper is removed; bench minor assessed to Team A.',
      'Goal is disallowed; no penalty assessed.',
    ],
    correct_answers: [2],
    rationale: 'The goalkeeper is an ineligible player (not listed on the line-up sheet), so the goal is disallowed and he is removed from the game. Team A is also assessed a bench minor penalty.',
    rule_number: '5.2',
    league: 'NHL',
    category: 'Teams',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 7 – Starting Lineup (7C)
  {
    text: 'At the first stoppage of play, Team B challenges Team A\'s starting line-up. The Referee finds the challenged player\'s name is correct on the lineup sheet, but his jersey number was listed incorrectly. Is Team A penalized?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — both name and number must be correct; bench minor assessed to Team A.',
      'No — the correct player\'s name is listed; an incorrect number alone is not the determining factor and no penalty applies.',
      'Yes — minor penalty assessed to the player whose number was listed incorrectly.',
      'No — but the Referee must correct the number on the lineup sheet.',
    ],
    correct_answers: [1],
    rationale: 'The determining factor is the correct player\'s name. If the correct player is listed by name, a wrong number on the starting lineup is not grounds for a penalty.',
    rule_number: '7.2',
    league: 'NHL',
    category: 'Teams',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 8 – Injured Players (8C)
  {
    text: 'During a face-off in Team A\'s end zone, A#20 attempts to draw the puck back and accidentally hits B#10 in the face with the butt-end of his stick. B#10 drops to the ice bleeding. Neither Referee saw it. The Linesperson reports what happened. If the contact is determined to be accidental due to both players being bent over during the face-off, what is the ruling?',
    answer_type: 'multiple_choice',
    options: [
      'Minor penalty to A#20 since any butt-end contact is an automatic penalty.',
      'No penalty assessed; face-off in neutral zone outside Team A\'s zone; B#10 must leave the ice.',
      'Match penalty to A#20 since a player was injured.',
      'Penalty shot awarded to Team B.',
    ],
    correct_answers: [1],
    rationale: 'If the contact is determined to be accidental, no penalty shall be assessed. The face-off is conducted in the neutral zone outside Team A\'s zone. B#10 must leave the ice because play was stopped due to his injury.',
    rule_number: '60.1',
    league: 'NHL',
    category: 'Injured Players',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 8 – Injured Players (8E)
  {
    text: 'Team A\'s goalkeeper is injured and replaced by the backup during a stoppage of play. Before the next stoppage occurs, Team A switches goalkeepers back on the fly, putting the original (recently injured) goalkeeper back in net. Is this permitted?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — any goalkeeper can be changed on the fly at any time.',
      'Yes — as long as the original goalkeeper is fully recovered.',
      'No — this is not permitted; a penalty for ineligible player is assessed.',
      'No — but only a warning is given on the first offense.',
    ],
    correct_answers: [2],
    rationale: 'When the replacement goalkeeper enters the game at a stoppage of play to replace an injured goalkeeper, the two cannot switch places again until the next stoppage of play. Changing back on the fly results in an ineligible player penalty.',
    rule_number: '8.2',
    league: 'NHL',
    category: 'Goalkeepers',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 8 – Injured Players (8K)
  {
    text: 'Team B is in a delayed off-side position. Team A has the puck behind their own net. The whistle is blown because a Team A player is injured on the ice in the neutral zone. Where is the face-off?',
    answer_type: 'multiple_choice',
    options: [
      'Team B\'s end zone, since they were in an off-side position.',
      'Center ice.',
      'Neutral zone just outside Team A\'s zone, since the delayed off-side was still in effect.',
      'Neutral zone just outside Team B\'s zone.',
    ],
    correct_answers: [2],
    rationale: 'Common sense dictates that since the delayed off-side was still in effect, the face-off should be conducted in the neutral zone just outside Team A\'s zone. The injury does not override the off-side situation.',
    rule_number: '8.1',
    league: 'NHL',
    category: 'Injured Players',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 8 – Injured Players (8M)
  {
    text: 'During play in Team A\'s end zone, a Team A defender is injured blocking a shot. The player crawls toward the boards when the trainer opens a gate on the side boards (separate from the Players\' Bench) and pulls the injured player off the ice directly to the dressing room. Is this legal?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — the priority is getting the injured player off the ice safely.',
      'Yes — trainers may use any gate in an emergency.',
      'No — an injured player must exit at the Players\' Bench; a bench minor penalty is assessed.',
      'No — but only if the player had possession of the puck.',
    ],
    correct_answers: [2],
    rationale: 'If an injured player wishes to retire from the ice, he must do so at the Players\' Bench and no other exit. Exiting through any other gate is an illegal player change and a bench minor penalty is imposed.',
    rule_number: '8.1',
    league: 'NHL',
    category: 'Injured Players',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 9 – Uniforms (9C)
  {
    text: 'Team A player returns to the ice without a helmet. The Referee stops play once Team A gains control of the puck and assesses a minor penalty. Where is the ensuing face-off?',
    answer_type: 'multiple_choice',
    options: [
      'Center ice.',
      'Neutral zone — nearest to where the play was stopped.',
      'End zone face-off spots in Team A\'s defending zone; Team B selects which spot.',
      'End zone face-off spots in Team B\'s defending zone; Team A selects which spot.',
    ],
    correct_answers: [2],
    rationale: 'Since a minor penalty is assessed to the Team A player, the ensuing face-off is conducted at one of the end zone face-off spots in Team A\'s defending zone. Team B selects which of the two spots to use.',
    rule_number: '9.6',
    league: 'NHL',
    category: 'Equipment',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 9 – Uniforms (9E)
  {
    text: 'Team A\'s goalkeeper loses his mask during play. What is the correct procedure for the Referee?',
    answer_type: 'multiple_choice',
    options: [
      'Stop play immediately regardless of which team has possession of the puck.',
      'Allow play to continue until the next natural stoppage.',
      'Stop play immediately if Team A has possession; stop play only if there is no immediate and impending scoring opportunity if Team B has possession.',
      'Assess Team A a delay of game penalty and stop play.',
    ],
    correct_answers: [2],
    rationale: 'If Team A (the goalkeeper\'s team) has control of the puck, play shall be stopped immediately. If Team B has the puck, play shall only be stopped if Team B has no immediate and impending scoring opportunity. This stoppage must be made by the Referee.',
    rule_number: '9.6',
    league: 'NHL',
    category: 'Equipment',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 9 – Uniforms (9L)
  {
    text: 'A player\'s helmet comes off during play while the puck is at his feet. He elects to make a pass to a teammate rather than immediately leaving the ice or replacing his helmet. Is this permitted?',
    answer_type: 'multiple_choice',
    options: [
      'No — he must immediately leave the ice or replace his helmet.',
      'Yes — a player who is making a play on the puck when his helmet comes off is given a reasonable opportunity to complete the play; no penalty is assessed.',
      'Yes — but only if the Referee grants permission.',
      'No — a minor penalty is assessed for continuing to play without a helmet.',
    ],
    correct_answers: [1],
    rationale: 'A player who is making a play on the puck or who is in position to make an immediate play on the puck at the time his helmet comes off shall be given a reasonable opportunity to complete the play before either exiting the ice or retrieving and replacing his helmet. No penalty shall be assessed.',
    rule_number: '9.6',
    league: 'NHL',
    category: 'Equipment',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 9 – Uniforms (9N)
  {
    text: 'During a battle for the puck in the corner, a Team A player grabs the back of a Team B player\'s helmet and deliberately pulls it off his head. What should the Referee do?',
    answer_type: 'multiple_choice',
    options: [
      'No penalty — removing a helmet is not a rulebook infraction.',
      'Warn the Team A player; penalize on a second occurrence.',
      'Assess a minor penalty for roughing to the Team A player for removing an opponent\'s helmet.',
      'Assess a match penalty — deliberately removing a helmet is an attempt to injure.',
    ],
    correct_answers: [2],
    rationale: 'The Team A player should be assessed a minor penalty for roughing for removing an opponent\'s helmet during play.',
    rule_number: '9.6',
    league: 'NHL',
    category: 'Equipment',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 10 – Sticks (10A)
  {
    text: 'A player takes a shot on goal with what appears to be a broken stick. The goalkeeper juggles the puck and it goes into the net. The Referee notices the shaft of the player\'s stick is broken. Is this a good goal?',
    answer_type: 'multiple_choice',
    options: [
      'No — any goal scored with a broken stick is automatically disallowed.',
      'Yes — unless the Referee can be certain the stick was broken before the shot was taken, the goal must stand.',
      'No — the Referee should review video to determine when the stick broke.',
      'Yes — the goal stands and a minor penalty is assessed to the scoring player.',
    ],
    correct_answers: [1],
    rationale: 'Unless the Referee can be certain that the stick was broken prior to the shot being taken, the goal must stand. If the Referee is certain the stick was broken before the shot, the goal is disallowed and a minor penalty assessed for participating in play with a broken stick.',
    rule_number: '10.3',
    league: 'NHL',
    category: 'Sticks',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 10 – Sticks (10H)
  {
    text: 'A goalkeeper loses his stick and it slides into the corner. A teammate picks it up and slides it along the ice back to the goalkeeper. Is this legal?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — sliding a stick along the ice is not the same as throwing it.',
      'Yes — teammates are allowed to assist a goalkeeper in retrieving his stick.',
      'No — a minor penalty is assessed to the offending player for throwing the stick.',
      'No — but only if the stick was slid from behind the opposing blue line.',
    ],
    correct_answers: [2],
    rationale: 'This is not legal. Sliding a stick to a goalkeeper is treated the same as throwing it. A minor penalty is assessed to the offending player for throwing the stick.',
    rule_number: '10.4',
    league: 'NHL',
    category: 'Sticks',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 10 – Sticks (10J)
  {
    text: 'At a stoppage of play, Team A requests a stick curvature measurement on Team B #7. When Team B #7 realizes his stick is about to be measured, he intentionally breaks it. What does the Referee do?',
    answer_type: 'multiple_choice',
    options: [
      'Assess a bench minor penalty for delay of game.',
      'No penalty — the stick can no longer be measured.',
      'Assess Team B #7 a minor penalty plus a 10-minute misconduct.',
      'Assess Team B #7 a game misconduct for unsportsmanlike conduct.',
    ],
    correct_answers: [2],
    rationale: 'Intentionally breaking a stick to avoid a measurement results in a minor penalty plus a 10-minute misconduct assessed to Team B #7.',
    rule_number: '10.5',
    league: 'NHL',
    category: 'Sticks',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 10 – Sticks (10Q)
  {
    text: 'A player on the Players\' Bench throws a stick to a teammate on the ice whose stick has broken. What penalties are assessed — to the player who threw the stick AND to the player who caught and used it?',
    answer_type: 'multiple_choice',
    options: [
      'Bench minor to the throwing player; minor to the player who used the thrown stick.',
      'Bench minor to the throwing player; no penalty to the player who used the thrown stick.',
      'Minor penalty to the throwing player; minor to the player who used the thrown stick.',
      'No penalty to either player — a teammate may provide a replacement stick.',
    ],
    correct_answers: [1],
    rationale: 'A bench minor penalty is assessed to the team for the player who threw the stick from the bench. No penalty is assessed to the player who caught and played with the thrown stick.',
    rule_number: '10.3',
    league: 'NHL',
    category: 'Sticks',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 10 – Sticks (10AA)
  {
    text: 'Team A scores a goal in the third period. Immediately after, the Team B Captain approaches the Referee and requests that the curvature of the goal-scorer\'s stick be measured. Is this permitted, and what happens if the stick is found to be illegal?',
    answer_type: 'multiple_choice',
    options: [
      'No — stick measurements can only be requested before a goal is scored.',
      'Yes — if the stick is illegal, the goal is disallowed and Team A receives a minor penalty.',
      'Yes — the goal stands regardless of the measurement result; if illegal, the Team A player gets a minor; if legal, Team B gets a bench minor.',
      'Yes — if the stick is illegal, Team A forfeits the game.',
    ],
    correct_answers: [2],
    rationale: 'A stick measurement may be requested after a goal. However, a goal cannot be disallowed as a result of the measurement. If the stick is illegal, the Team A player is assessed a minor penalty. If the stick is legal, Team B is assessed a bench minor penalty.',
    rule_number: '10.5',
    league: 'NHL',
    category: 'Sticks',
    question_type: 'situation',
    is_approved: true,
  },
  // Rule 13 – Puck (13A)
  {
    text: 'During play, a fan throws another puck onto the ice. Is it mandatory that the officials stop play immediately?',
    answer_type: 'multiple_choice',
    options: [
      'Yes — any foreign object on the ice requires an immediate stoppage of play.',
      'No — play shall not be stopped until there is no imminent scoring opportunity with the legal puck, or the play is in the neutral zone.',
      'No — play continues unless both Referees agree the extra puck is interfering.',
      'Yes — but only if the second puck enters the offensive zone.',
    ],
    correct_answers: [1],
    rationale: 'Play shall not be stopped until the Referee deems there is no imminent scoring opportunity with the legal puck, or the play with the legal puck is located in the neutral zone.',
    rule_number: '13.3',
    league: 'NHL',
    category: 'Game Flow',
    question_type: 'situation',
    is_approved: true,
  },
]

async function seed() {
  console.log(`Inserting ${questions.length} questions...`)

  const payload = questions.map((q) => ({ ...q, created_by: ADMIN_ID }))

  const { data, error } = await supabase
    .from('questions')
    .insert(payload)
    .select('id, text')

  if (error) {
    console.error('Error inserting questions:', error)
    process.exit(1)
  }

  console.log(`✅ Successfully inserted ${data.length} questions:`)
  data.forEach((q, i) => console.log(`  ${i + 1}. ${q.text.slice(0, 70)}...`))
}

seed()
