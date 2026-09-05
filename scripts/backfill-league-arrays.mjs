import { createClient } from '@supabase/supabase-js'

// One-off backfill: supabase-migration-league-multiselect.sql changed the
// `league` column's constraint/type expectations to text[], but the actual
// column in the live table was never migrated — every row still holds the
// old plain-string value ('NHL' | 'AHL' | 'both'). This converts each row
// to the array shape src/types/index.ts (League[]) expects.
const supabase = createClient('https://lkaknqttnddboelsxdtt.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const STRING_TO_ARRAY = {
  NHL: ['NHL'],
  AHL: ['AHL'],
  both: ['NHL', 'AHL'],
}

async function main() {
  const { data: rows, error } = await supabase.from('questions').select('id, league')
  if (error) {
    console.error('Failed to fetch questions:', error.message)
    process.exit(1)
  }

  console.log(`Fetched ${rows.length} rows.`)

  const toFix = rows.filter((r) => !Array.isArray(r.league))
  const unexpected = [...new Set(toFix.map((r) => r.league).filter((v) => !(v in STRING_TO_ARRAY)))]
  if (unexpected.length > 0) {
    console.error('Unexpected league values found, aborting:', unexpected)
    process.exit(1)
  }

  console.log(`${rows.length - toFix.length} rows already arrays, ${toFix.length} rows need backfill.`)

  let ok = 0
  let failed = 0
  for (const row of toFix) {
    const league = STRING_TO_ARRAY[row.league]
    const { error: updateError } = await supabase.from('questions').update({ league }).eq('id', row.id)
    if (updateError) {
      failed++
      console.error(`✗ ${row.id} (${row.league}):`, updateError.message)
    } else {
      ok++
    }
  }

  console.log(`Done. ${ok} rows updated, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

main()
