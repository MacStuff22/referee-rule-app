import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://lkaknqttnddboelsxdtt.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await supabase.from('questions').select('situation_id,text,options').in('situation_id',['26A','26B','26C','26D','26E'])
data?.forEach(q => { console.log('=== '+q.situation_id+' ==='); console.log(q.text); console.log('OPTIONS:',JSON.stringify(q.options)); console.log() })
// Also check for duplicates of the 46 seed questions
const { data: dupes } = await supabase.from('questions').select('situation_id').order('situation_id')
const counts = {}
dupes?.forEach(q => { counts[q.situation_id] = (counts[q.situation_id] || 0) + 1 })
const hasDupes = Object.entries(counts).filter(([,c]) => c > 1)
if (hasDupes.length) console.log('\nDUPLICATES:', hasDupes.map(([id,c]) => id+'('+c+'x)').join(', '))
else console.log('\nNo duplicates found.')
