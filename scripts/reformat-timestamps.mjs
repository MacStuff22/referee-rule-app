import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://lkaknqttnddboelsxdtt.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const updates = [
  {
    situation_id: '19C',
    text: `End of 1st Period:
- Team A has a minor penalty that will carry over into the 2nd period
- Referee signals a delayed minor against Team B
- 0:00 — Team B's minor is assessed at the buzzer

Start of 2nd Period:
- 20:00 — An additional Team A player is assessed a minor for unsportsmanlike conduct

What is the on-ice strength to start the second period?`,
  },
  {
    situation_id: '22A',
    text: `Stoppage 1:
- Team A is shorthanded with 1:30 remaining on a minor penalty
- One player from each team is assessed a minor penalty (coincidental — not on the penalty clock)

Stoppage 2:
- One of those players (already in the box serving the coincidental minor) is assessed an additional misconduct penalty

Does a substitute need to sit for the remaining minor time?`,
  },
]

for (const { situation_id, text } of updates) {
  const { error } = await supabase.from('questions').update({ text }).eq('situation_id', situation_id)
  if (error) console.error(`Failed ${situation_id}:`, error.message)
  else console.log(`✓ ${situation_id} updated`)
}
