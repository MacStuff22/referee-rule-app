import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lkaknqttnddboelsxdtt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Each entry: DB UUID → confirmed situation ID, rule_references, category
const ASSIGNMENTS = [
  // Rule 5 – Teams
  {
    id: '15229e01-bc6f-4a86-bf3a-3fd1910b4f68',
    situation_id: '5C',
    rule_references: ['5.2 P.2'],
    category: 'Teams',
    handbook_section: 'Section 2 – Teams',
  },
  {
    id: '13a68c8c-baaa-4781-aff0-b24ec93771d8',
    situation_id: '7A',
    rule_references: ['5.2', '7.2'],
    category: 'Starting Line-up',
    handbook_section: 'Section 2 – Teams',
  },
  {
    id: '62d2412c-dbd7-47c4-a930-d2dd8c25c620',
    situation_id: '5H',
    rule_references: ['5.3'],
    category: 'Teams',
    handbook_section: 'Section 2 – Teams',
  },
  // Rule 6 – Captain and Alternate Captains
  {
    id: '2de70952-b44b-40fa-8495-34b49427b421',
    situation_id: '6B',
    rule_references: ['6', '33'],
    category: 'Captain / Alternate Captains',
    handbook_section: 'Section 2 – Teams',
  },
  // Rule 7 – Starting Line-up
  {
    id: '6c22062c-4e66-4f2c-95c7-649fb6a1cf0d',
    situation_id: '7C',
    rule_references: ['7.2'],
    category: 'Starting Line-up',
    handbook_section: 'Section 2 – Teams',
  },
  // Rule 8 – Injured Players
  {
    id: '8baca0c9-3862-4891-bad7-3c697db7e997',
    situation_id: '8E',
    rule_references: ['8.2 P.4'],
    category: 'Injured Players',
    handbook_section: 'Section 2 – Teams',
  },
  {
    id: '9649b6af-b247-455c-9beb-fddf3f3cc082',
    situation_id: '8K',
    rule_references: ['8.1 P.8'],
    category: 'Injured Players',
    handbook_section: 'Section 2 – Teams',
  },
  {
    id: '7fda8a4f-b356-4572-b3e7-53c255296704',
    situation_id: '8M',
    rule_references: ['8.1 P.2'],
    category: 'Injured Players',
    handbook_section: 'Section 2 – Teams',
  },
  // Rule 9 – Uniforms
  {
    id: '6df32c9a-e0c7-4dfb-97a9-b600f2a8dbfd',
    situation_id: '9C',
    rule_references: ['9.6 P.3'],
    category: 'Uniforms / Player Equipment',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: 'd0183df9-1e71-40d2-9bc8-f10398196bbc',
    situation_id: '9E',
    rule_references: ['9.6 P.3'],
    category: 'Uniforms / Player Equipment',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: 'ec34f875-6be0-40d3-9986-d1c83d6ad7f1',
    situation_id: '9L',
    rule_references: ['9.6 P.2'],
    category: 'Uniforms / Player Equipment',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: '89bdf8cc-9d4a-49ca-8cb7-22f495ec9001',
    situation_id: '9N',
    rule_references: ['9.6 P.4'],
    category: 'Uniforms / Player Equipment',
    handbook_section: 'Section 3 – Equipment',
  },
  // Rule 10 – Sticks
  {
    id: '946df93d-e218-4502-93a1-db71a721a591',
    situation_id: '10A',
    rule_references: ['10.3'],
    category: 'Sticks',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: '69a0966b-0448-488e-81eb-e8f6d5c2f537',
    situation_id: '10H',
    rule_references: ['10.4 P.1'],
    category: 'Sticks',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: 'a7eb73e4-5639-4931-abe3-a2e76ec9ce3a',
    situation_id: '10J',
    rule_references: ['10.5 P.9'],
    category: 'Sticks',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: 'ceef82b1-07be-4190-b4d4-ef1570df898f',
    situation_id: '10Q',
    rule_references: ['10.3'],
    category: 'Sticks',
    handbook_section: 'Section 3 – Equipment',
  },
  {
    id: '612400d8-a4c2-4be4-8784-f054a27e8a07',
    situation_id: '10AA',
    rule_references: ['10.5 P.6', '10.5 P.8'],
    category: 'Sticks',
    handbook_section: 'Section 3 – Equipment',
  },
  // Rule 13 – Puck
  {
    id: '91b68201-9b77-47f6-8972-e7317736c47f',
    situation_id: '13A',
    rule_references: ['13.3'],
    category: 'Puck',
    handbook_section: 'Section 3 – Equipment',
  },
  // Rule 60 – High-sticking (Section 8)
  {
    id: '5a499f47-78e4-4f09-b27e-9347f1819f3c',
    situation_id: '60A',
    rule_references: ['60.1', '8.1 P.8'],
    category: 'High-sticking',
    handbook_section: 'Section 8 – Stick Infractions',
  },
]

async function run() {
  console.log(`Assigning situation IDs to ${ASSIGNMENTS.length} questions…\n`)
  let ok = 0

  for (const a of ASSIGNMENTS) {
    const { error } = await supabase
      .from('questions')
      .update({
        situation_id: a.situation_id,
        rule_references: a.rule_references,
        rule_number: a.rule_references[0],
        category: a.category,
        handbook_section: a.handbook_section,
      })
      .eq('id', a.id)

    if (error) {
      console.error(`  ✗ ${a.situation_id}: ${error.message}`)
    } else {
      console.log(`  ✓ ${a.situation_id.padEnd(5)} ${a.handbook_section}`)
      ok++
    }
  }

  console.log(`\nDone. ${ok}/${ASSIGNMENTS.length} updated.`)
}

run()
