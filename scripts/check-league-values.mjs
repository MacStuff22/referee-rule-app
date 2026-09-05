import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data, error, count } = await supabase
    .from('questions')
    .select('league', { count: 'exact' })

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log(`Total rows: ${count}`)

  const tally = new Map()
  for (const row of data) {
    const key = JSON.stringify(row.league)
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  console.log('Distinct league values (raw JSON) and counts:')
  for (const [key, n] of tally) {
    console.log(`  ${key}: ${n}`)
  }
}

main()
