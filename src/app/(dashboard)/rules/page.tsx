'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { RuleComparison } from '@/types'

export default function RulesPage() {
  const [rules, setRules] = useState<RuleComparison[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadRules()
  }, [])

  async function loadRules() {
    const { data } = await supabase
      .from('rule_comparisons')
      .select('*')
      .order('rule_number')
    setRules(data ?? [])
    setLoading(false)
  }

  const filtered = rules.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.rule_number.toLowerCase().includes(q) ||
      r.rule_name.toLowerCase().includes(q) ||
      r.nhl_text.toLowerCase().includes(q) ||
      (r.ahl_text ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rule Comparison</h1>
        <p className="text-gray-500 text-sm mt-1">NHL vs AHL — differences are highlighted in yellow</p>
      </div>

      <Input
        placeholder="Search by rule number or keyword…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <p className="text-gray-500 text-sm">Loading rules…</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {search ? 'No rules match your search.' : 'No rules added yet. Add them via the database or a future import tool.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-lg border ${rule.has_difference ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'} overflow-hidden`}
            >
              <div className="px-4 py-3 border-b border-inherit flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">Rule {rule.rule_number}</span>
                  <span className="text-gray-700 font-medium">{rule.rule_name}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">{rule.category}</Badge>
                  {rule.has_difference && (
                    <Badge className="bg-yellow-400 text-yellow-900 text-xs border-0">Differs</Badge>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-inherit">
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">NHL</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{rule.nhl_text}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">AHL</p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {rule.ahl_text ?? <span className="text-gray-400 italic">Same as NHL</span>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
