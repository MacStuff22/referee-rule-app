import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

export function ProgressBar({
  value,
  tone = 'default',
  className,
}: {
  /** 0..1 */
  value: number
  tone?: 'default' | 'good' | 'warn' | 'soft'
  className?: string
}) {
  const fill = { default: 'bg-slate-900', good: 'bg-green-600', warn: 'bg-amber-500', soft: 'bg-blue-300' }[tone]
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}>
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function LabeledBar({
  label,
  value,
  display,
  tone,
}: {
  label: string
  value: number
  display: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'soft'
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{display}</span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  )
}

export function DeltaPill({ points, suffix = '' }: { points: number | null; suffix?: string }) {
  if (points === null) return null
  const up = points > 0
  const flat = points === 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold',
        flat ? 'bg-gray-100 text-gray-600' : up ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      )}
    >
      {flat ? '■' : up ? '▲' : '▼'} {Math.abs(points)} {Math.abs(points) === 1 ? 'point' : 'points'}
      {suffix}
    </span>
  )
}

export function NotEnoughData({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500">{children}</p>
}

export function SectionHeading({ number, title, children }: { number: number; title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {number}
        </span>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {children && <p className="text-sm text-gray-500">{children}</p>}
    </div>
  )
}
