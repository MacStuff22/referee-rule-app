// One-time migration: append the penalty table placement marker to the end
// of `text` for questions that already had a penalty_table before the
// chip-placement feature shipped. Matches appendPenaltyTableMarker() in
// question-form.tsx -- marker goes at the end (default: below the text),
// admin repositions it from there via the blue chip.
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const PENALTY_TABLE_MARKER = '[[Penalty Table]]'

const QUESTION_IDS = [
  'd12ecfaf-4ad6-4e35-be90-33475432feac', // 19A
  'a6c61146-6961-4205-a9a6-3606f84d796f', // 19B
  'a7f9273c-3672-4d37-8cde-215e4d89e084', // 19F
  '2e5a0392-2640-45c8-b720-75a2aaec57e0', // 19G
  '3309bb00-941d-440c-90f0-c77f8d31213c', // 19L
  '334b7348-9b5f-4e09-bcbf-0e171c5f2293', // 19N
  '9b0354ba-353e-426a-b806-7203209331ea', // 19Q
  'aac7ee38-e83c-4321-a76e-0e03b5cc9d27', // 20A
  '27331861-23d3-469b-8360-415b15b37f87', // 26B
  '06fab594-128c-4726-9577-ed25739ea81a', // 26C
  '20279c19-a3d9-4234-abeb-4d8f387c27ee', // 26D
  '52562285-3129-4dba-9472-db279afe0178', // 26E
]

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

for (const id of QUESTION_IDS) {
  const { data: q, error: fetchError } = await supabase
    .from('questions')
    .select('id, situation_id, text')
    .eq('id', id)
    .single()

  if (fetchError || !q) {
    console.error(`SKIP ${id}: fetch failed —`, fetchError?.message)
    continue
  }

  if (q.text.includes(PENALTY_TABLE_MARKER)) {
    console.log(`SKIP ${q.situation_id} (${id}): marker already present`)
    continue
  }

  const nextText = `${q.text.trimEnd()} ${PENALTY_TABLE_MARKER}`
  const { error: updateError } = await supabase.from('questions').update({ text: nextText }).eq('id', id)

  if (updateError) {
    console.error(`FAILED ${q.situation_id} (${id}):`, updateError.message)
  } else {
    console.log(`OK ${q.situation_id} (${id})`)
  }
}
