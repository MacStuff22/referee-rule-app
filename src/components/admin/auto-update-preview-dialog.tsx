'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Question } from '@/types'

// The only fields an exact-match auto-update ever copies — never category,
// handbook_section, situation_id, league, is_approved, penalty_table, or
// created_by.
const AUTO_UPDATE_FIELDS = [
  'text',
  'options',
  'correct_answers',
  'rationale',
  'sub_questions',
  'rule_number',
  'rule_references',
] as const
type AutoUpdateField = (typeof AUTO_UPDATE_FIELDS)[number]

const FIELD_LABELS: Record<AutoUpdateField, string> = {
  text: 'Question text',
  options: 'Options',
  correct_answers: 'Correct answer(s)',
  rationale: 'Rationale',
  sub_questions: 'Sub-questions',
  rule_number: 'Primary rule',
  rule_references: 'Rule references',
}

function displayValue(value: unknown): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const s = String(value)
  return s.trim() ? s : '—'
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetQuestions: Question[]
  payload: Record<string, unknown>
  onConfirm: (targetIds: string[], autoUpdatePayload: Record<string, unknown>) => Promise<void>
}

export function AutoUpdatePreviewDialog({ open, onOpenChange, targetQuestions, payload, onConfirm }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const autoUpdatePayload = Object.fromEntries(AUTO_UPDATE_FIELDS.map((field) => [field, payload[field]]))

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      await onConfirm(
        targetQuestions.map((q) => q.id),
        autoUpdatePayload
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the matched questions.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto-update exact matches</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          This overwrites the question text, options/answers, rationale, and rule references on{' '}
          {targetQuestions.length === 1 ? 'the situation' : 'the situations'} below to match what you just saved.
          Category, handbook section, situation ID, league, approval status, and penalty table are left untouched.
        </p>
        <div className="space-y-4">
          {targetQuestions.map((q) => {
            const changedFields = AUTO_UPDATE_FIELDS.filter(
              (field) =>
                displayValue((q as unknown as Record<string, unknown>)[field]) !== displayValue(autoUpdatePayload[field])
            )
            return (
              <div key={q.id} className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Situation {q.situation_id}</p>
                {changedFields.length === 0 && <p className="text-xs text-gray-400">Already matches — no change.</p>}
                {changedFields.map((field) => (
                  <div key={field} className="text-xs">
                    <p className="text-gray-400">{FIELD_LABELS[field]}</p>
                    <p className="text-red-600 line-through break-words">
                      {displayValue((q as unknown as Record<string, unknown>)[field])}
                    </p>
                    <p className="text-green-700 break-words">{displayValue(autoUpdatePayload[field])}</p>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-3 pt-2">
          <Button onClick={handleConfirm} disabled={saving} className="flex-1">
            {saving ? 'Updating…' : 'Confirm update'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
