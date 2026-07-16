import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://lkaknqttnddboelsxdtt.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: all } = await supabase.from('questions').select('id, situation_id, created_at').order('created_at', { ascending: true })

// Group by situation_id
const groups = {}
all.forEach(q => {
  if (!groups[q.situation_id]) groups[q.situation_id] = []
  groups[q.situation_id].push(q)
})

// Delete all but the first (oldest) of each duplicate
const toDelete = []
for (const [id, rows] of Object.entries(groups)) {
  if (rows.length > 1) toDelete.push(...rows.slice(1).map(r => r.id))
}

if (!toDelete.length) { console.log('No duplicates.'); process.exit(0) }

console.log(`Deleting ${toDelete.length} duplicate rows…`)
const { error } = await supabase.from('questions').delete().in('id', toDelete)
if (error) { console.error('Error:', error.message); process.exit(1) }
console.log('Done.')
