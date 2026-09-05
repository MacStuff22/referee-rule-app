'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { compareSituationIds } from '@/lib/situationId'
import { canonicalPair, type MatchType, type SituationMatch } from '@/lib/situationMatches'

const TIER_LABELS: Record<MatchType, string> = {
  exact_match: 'Exact Match',
  very_similar: 'Very Similar',
  similar_concept: 'Similar Concept',
}

const TIER_OPTIONS: MatchType[] = ['exact_match', 'very_similar', 'similar_concept']

interface Props {
  matches: SituationMatch[]
}

export default function MatchesClient({ matches }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<MatchType | ''>('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sitA, setSitA] = useState('')
  const [sitB, setSitB] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('exact_match')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    let result = matches.filter((m) => {
      if (filterType && m.match_type !== filterType) return false
      if (search) {
        const s = search.toLowerCase()
        return m.situation_id_a.toLowerCase().includes(s) || m.situation_id_b.toLowerCase().includes(s)
      }
      return true
    })
    result = [...result].sort((a, b) => compareSituationIds(a.situation_id_a, b.situation_id_a))
    return result
  }, [matches, search, filterType])

  function openAddDialog() {
    setEditingId(null)
    setSitA('')
    setSitB('')
    setMatchType('exact_match')
    setError('')
    setWarning('')
    setDialogOpen(true)
  }

  function openEditDialog(m: SituationMatch) {
    setEditingId(m.id)
    setSitA(m.situation_id_a)
    setSitB(m.situation_id_b)
    setMatchType(m.match_type)
    setError('')
    setWarning('')
    setDialogOpen(true)
  }

  async function handleSubmit() {
    setError('')
    setWarning('')
    const a = sitA.trim().toUpperCase()
    const b = sitB.trim().toUpperCase()

    if (!a || !b) { setError('Both situation IDs are required.'); return }
    if (a === b) { setError('A situation can’t be matched to itself.'); return }

    setSaving(true)

    // Soft typo guard — situation_id has no foreign key, so this can only warn, not block.
    const [{ count: countA }, { count: countB }] = await Promise.all([
      supabase.from('questions').select('id', { count: 'exact', head: true }).eq('situation_id', a),
      supabase.from('questions').select('id', { count: 'exact', head: true }).eq('situation_id', b),
    ])
    const missing = [countA ? null : a, countB ? null : b].filter(Boolean)
    if (missing.length > 0) {
      setWarning(`No questions currently use situation ID ${missing.join(' or ')} — check for a typo before saving again.`)
      setSaving(false)
      return
    }

    const [situation_id_a, situation_id_b] = canonicalPair(a, b)

    let writeError
    if (editingId) {
      const { error } = await supabase
        .from('situation_matches')
        .update({ situation_id_a, situation_id_b, match_type: matchType })
        .eq('id', editingId)
      writeError = error
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('situation_matches')
        .insert({ situation_id_a, situation_id_b, match_type: matchType, created_by: user?.id })
      writeError = error
    }

    setSaving(false)

    if (writeError) {
      if (writeError.code === '23505') {
        setError('This pair already has a match — edit the existing one instead.')
      } else {
        setError(writeError.message)
      }
      return
    }

    setDialogOpen(false)
    router.refresh()
  }

  async function handleDelete(m: SituationMatch) {
    if (!confirm(`Delete the match between ${m.situation_id_a} and ${m.situation_id_b}?`)) return
    await supabase.from('situation_matches').delete().eq('id', m.id)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Match Type</label>
            <select
              className="w-full border rounded-md px-2 py-1.5 text-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MatchType | '')}
            >
              <option value="">All Types</option>
              {TIER_OPTIONS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Situation ID…"
              className="text-sm h-8"
            />
          </div>
          <Button onClick={openAddDialog} className="sm:justify-self-end">+ Add Match</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No matches found.</p>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {filtered.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <Badge className="text-xs bg-slate-800 text-white hover:bg-slate-700">{m.situation_id_a}</Badge>
                <span className="text-gray-400 text-sm">↔</span>
                <Badge className="text-xs bg-slate-800 text-white hover:bg-slate-700">{m.situation_id_b}</Badge>
                <Badge variant="outline" className="text-xs">{TIER_LABELS[m.match_type]}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => openEditDialog(m)}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(m)} className="text-red-600 hover:text-red-700">
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Match' : 'Add Match'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Situation ID A</Label>
                <Input value={sitA} onChange={(e) => setSitA(e.target.value)} placeholder="e.g. 16D" className="uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label>Situation ID B</Label>
                <Input value={sitB} onChange={(e) => setSitB(e.target.value)} placeholder="e.g. 24L" className="uppercase" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Match Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as MatchType)}
              >
                {TIER_OPTIONS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
              </select>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {warning && (
              <Alert>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={saving} className="flex-1">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Match'}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
