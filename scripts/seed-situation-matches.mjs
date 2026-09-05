/**
 * Seeds the situation_matches table from Morgan's curated list of duplicate/
 * related situations. Pair-level, not group-level — 72A/76R/80A is the one
 * case where match type isn't uniform across a whole group (72A-76R is an
 * exact match, but each of them is only "very similar" to 80A), so groups
 * are expanded into explicit pairs rather than tagged as a single tier.
 *
 * Safe to re-run: upserts on the (situation_id_a, situation_id_b) unique
 * constraint, so correcting or extending this list later just means editing
 * the array below and running the script again.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_ID = '8c5875c3-9759-4ca7-a6bc-d6501b8789a8'

// (a, b) pairs are written in whatever order is convenient here — canonicalPair()
// below reorders them consistently before writing, matching src/lib/situationMatches.ts.
const pairs = [
  { situation_id_a: '5D', situation_id_b: '35C', match_type: 'exact_match' },
  { situation_id_a: '5D', situation_id_b: '46J', match_type: 'exact_match' },
  { situation_id_a: '35C', situation_id_b: '46J', match_type: 'exact_match' },
  { situation_id_a: '8A', situation_id_b: '27H', match_type: 'similar_concept' },
  { situation_id_a: '8B', situation_id_b: '68A', match_type: 'very_similar' },
  { situation_id_a: '8B', situation_id_b: '78C', match_type: 'very_similar' },
  { situation_id_a: '68A', situation_id_b: '78C', match_type: 'very_similar' },
  { situation_id_a: '8C', situation_id_b: '60A', match_type: 'very_similar' },
  { situation_id_a: '8D', situation_id_b: '84H', match_type: 'very_similar' },
  { situation_id_a: '8F', situation_id_b: '8G', match_type: 'very_similar' },
  { situation_id_a: '8H', situation_id_b: '24D', match_type: 'very_similar' },
  { situation_id_a: '8H', situation_id_b: '74B', match_type: 'very_similar' },
  { situation_id_a: '24D', situation_id_b: '74B', match_type: 'very_similar' },
  { situation_id_a: '10C', situation_id_b: '53C', match_type: 'very_similar' },
  { situation_id_a: '10C', situation_id_b: '53M', match_type: 'very_similar' },
  { situation_id_a: '53C', situation_id_b: '53M', match_type: 'very_similar' },
  { situation_id_a: '10D', situation_id_b: '56A', match_type: 'very_similar' },
  { situation_id_a: '10F', situation_id_b: '32B', match_type: 'exact_match' },
  { situation_id_a: '10G', situation_id_b: '53J', match_type: 'exact_match' },
  { situation_id_a: '15A', situation_id_b: '39A', match_type: 'exact_match' },
  { situation_id_a: '15A', situation_id_b: '63B', match_type: 'exact_match' },
  { situation_id_a: '39A', situation_id_b: '63B', match_type: 'exact_match' },
  { situation_id_a: '15B', situation_id_b: '76JJ', match_type: 'exact_match' },
  { situation_id_a: '15B', situation_id_b: '83Y', match_type: 'exact_match' },
  { situation_id_a: '76JJ', situation_id_b: '83Y', match_type: 'exact_match' },
  { situation_id_a: '16D', situation_id_b: '24L', match_type: 'very_similar' },
  { situation_id_a: '17C', situation_id_b: '76X', match_type: 'very_similar' },
  { situation_id_a: '17D', situation_id_b: '76Y', match_type: 'very_similar' },
  { situation_id_a: '19E', situation_id_b: '27A', match_type: 'very_similar' },
  { situation_id_a: '19H', situation_id_b: '76L', match_type: 'very_similar' },
  { situation_id_a: '19H', situation_id_b: '81M', match_type: 'very_similar' },
  { situation_id_a: '76L', situation_id_b: '81M', match_type: 'very_similar' },
  { situation_id_a: '20D', situation_id_b: '20E', match_type: 'similar_concept' },
  { situation_id_a: '20D', situation_id_b: '20F', match_type: 'similar_concept' },
  { situation_id_a: '20E', situation_id_b: '20F', match_type: 'similar_concept' },
  { situation_id_a: '23A', situation_id_b: '39E', match_type: 'very_similar' },
  { situation_id_a: '24G', situation_id_b: '55A', match_type: 'very_similar' },
  { situation_id_a: '24G', situation_id_b: '57A', match_type: 'very_similar' },
  { situation_id_a: '55A', situation_id_b: '57A', match_type: 'very_similar' },
  { situation_id_a: '24J', situation_id_b: '84E', match_type: 'exact_match' },
  { situation_id_a: '24Y', situation_id_b: '57D', match_type: 'very_similar' },
  { situation_id_a: '25A', situation_id_b: '61A', match_type: 'exact_match' },
  { situation_id_a: '27C', situation_id_b: '84F', match_type: 'exact_match' },
  { situation_id_a: '31A', situation_id_b: '37A', match_type: 'very_similar' },
  { situation_id_a: '31A', situation_id_b: '78G', match_type: 'very_similar' },
  { situation_id_a: '37A', situation_id_b: '78G', match_type: 'very_similar' },
  { situation_id_a: '32D', situation_id_b: '53G', match_type: 'very_similar' },
  { situation_id_a: '34A', situation_id_b: '34B', match_type: 'similar_concept' },
  { situation_id_a: '34C', situation_id_b: 'M-4', match_type: 'exact_match' },
  { situation_id_a: '35A', situation_id_b: '35D', match_type: 'similar_concept' },
  { situation_id_a: '35A', situation_id_b: '35E', match_type: 'similar_concept' },
  { situation_id_a: '35A', situation_id_b: '35F', match_type: 'similar_concept' },
  { situation_id_a: '35D', situation_id_b: '35E', match_type: 'similar_concept' },
  { situation_id_a: '35D', situation_id_b: '35F', match_type: 'similar_concept' },
  { situation_id_a: '35E', situation_id_b: '35F', match_type: 'similar_concept' },
  { situation_id_a: '35B', situation_id_b: '68C', match_type: 'very_similar' },
  { situation_id_a: '35B', situation_id_b: '70B', match_type: 'very_similar' },
  { situation_id_a: '35B', situation_id_b: '78D', match_type: 'very_similar' },
  { situation_id_a: '68C', situation_id_b: '70B', match_type: 'very_similar' },
  { situation_id_a: '68C', situation_id_b: '78D', match_type: 'very_similar' },
  { situation_id_a: '70B', situation_id_b: '78D', match_type: 'very_similar' },
  { situation_id_a: '37C', situation_id_b: '60C', match_type: 'exact_match' },
  { situation_id_a: '37C', situation_id_b: '80F', match_type: 'exact_match' },
  { situation_id_a: '60C', situation_id_b: '80F', match_type: 'exact_match' },
  { situation_id_a: '37D', situation_id_b: '78N', match_type: 'exact_match' },
  { situation_id_a: '38G', situation_id_b: '38H', match_type: 'similar_concept' },
  { situation_id_a: '39D', situation_id_b: '75B', match_type: 'exact_match' },
  { situation_id_a: '39G', situation_id_b: '75C', match_type: 'exact_match' },
  { situation_id_a: '46T', situation_id_b: '56E', match_type: 'exact_match' },
  { situation_id_a: '46V', situation_id_b: '46Z', match_type: 'similar_concept' },
  { situation_id_a: '53A', situation_id_b: '60B', match_type: 'exact_match' },
  { situation_id_a: '53A', situation_id_b: '75A', match_type: 'exact_match' },
  { situation_id_a: '60B', situation_id_b: '75A', match_type: 'exact_match' },
  { situation_id_a: '60H', situation_id_b: '60K', match_type: 'very_similar' },
  { situation_id_a: '63E', situation_id_b: '85F', match_type: 'exact_match' },
  { situation_id_a: '63P', situation_id_b: '74E', match_type: 'exact_match' },
  { situation_id_a: '63R', situation_id_b: '67C', match_type: 'exact_match' },
  { situation_id_a: '63U', situation_id_b: '78A', match_type: 'exact_match' },
  { situation_id_a: '63W', situation_id_b: '63NN', match_type: 'very_similar' },
  { situation_id_a: '67A', situation_id_b: '79B', match_type: 'very_similar' },
  { situation_id_a: '69C', situation_id_b: '75D', match_type: 'very_similar' },
  { situation_id_a: '71C', situation_id_b: '76K', match_type: 'exact_match' },
  { situation_id_a: '71E', situation_id_b: '76D', match_type: 'exact_match' },
  { situation_id_a: '72C', situation_id_b: '76G', match_type: 'exact_match' },
  { situation_id_a: '74G', situation_id_b: '84A', match_type: 'exact_match' },
  { situation_id_a: '76C', situation_id_b: '85A', match_type: 'exact_match' },
  { situation_id_a: '76F', situation_id_b: '83V', match_type: 'exact_match' },
  { situation_id_a: '76U', situation_id_b: '80D', match_type: 'exact_match' },
  { situation_id_a: '76DD', situation_id_b: '82B', match_type: 'exact_match' },
  { situation_id_a: '81A', situation_id_b: '83F', match_type: 'exact_match' },
  { situation_id_a: '81C', situation_id_b: '85T', match_type: 'exact_match' },
  { situation_id_a: '81F', situation_id_b: '82A', match_type: 'exact_match' },
  { situation_id_a: '83J', situation_id_b: '85B', match_type: 'exact_match' },
  { situation_id_a: '83NN', situation_id_b: '83PP', match_type: 'similar_concept' },
  { situation_id_a: '85W', situation_id_b: '85AA', match_type: 'similar_concept' },
  { situation_id_a: '85W', situation_id_b: '85BB', match_type: 'similar_concept' },
  { situation_id_a: '85AA', situation_id_b: '85BB', match_type: 'similar_concept' },
  // Corrected from Morgan's spreadsheet: '82N' doesn't exist in the handbook
  // (82-prefixed situations only go up to 82F); text confirms this is 80N.
  { situation_id_a: '76SS', situation_id_b: '80N', match_type: 'similar_concept' },
  // The one case where match type isn't uniform across a group: 72A and 76R
  // are identical to each other, but each is only "very similar" to 80A.
  { situation_id_a: '72A', situation_id_b: '76R', match_type: 'exact_match' },
  { situation_id_a: '72A', situation_id_b: '80A', match_type: 'very_similar' },
  { situation_id_a: '76R', situation_id_b: '80A', match_type: 'very_similar' },
]

function canonicalPair(a, b) {
  return a <= b ? [a, b] : [b, a]
}

async function run() {
  console.log(`Seeding ${pairs.length} situation matches…\n`)

  const rows = pairs.map(({ situation_id_a, situation_id_b, match_type }) => {
    const [a, b] = canonicalPair(situation_id_a, situation_id_b)
    return { situation_id_a: a, situation_id_b: b, match_type, created_by: ADMIN_ID }
  })

  let upserted = 0
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25)
    const { data, error } = await supabase
      .from('situation_matches')
      .upsert(batch, { onConflict: 'situation_id_a,situation_id_b' })
      .select('situation_id_a, situation_id_b')
    if (error) {
      console.error(`Batch ${i / 25 + 1} error:`, error.message)
    } else {
      data.forEach((r) => console.log(`  ✓ ${r.situation_id_a} ↔ ${r.situation_id_b}`))
      upserted += data.length
    }
  }

  console.log(`\nDone. ${upserted}/${rows.length} matches upserted.`)
}

run()
