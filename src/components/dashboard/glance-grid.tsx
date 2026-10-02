'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface GlanceTileSpec {
  id: string
  number: number
  title: string
  /** One-line answer shown while the tile is closed. */
  summary: ReactNode
  /** Full view shown when the tile is open. */
  detail: ReactNode
}

export function GlanceGrid({ tiles }: { tiles: GlanceTileSpec[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const allOpen = open.size === tiles.length

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Today at a glance</h2>
          <p className="text-sm text-gray-500">Click a tile to see the full picture.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(tiles.map((t) => t.id)))}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-gray-50"
        >
          {allOpen ? 'Close all' : 'Open all'}
        </button>
      </div>

      <div className="grid grid-flow-row-dense gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const isOpen = open.has(t.id)
          const panelId = `glance-${t.id}`
          return (
            <article
              key={t.id}
              className={cn(
                'flex min-w-0 flex-col rounded-xl bg-white ring-1 ring-foreground/10',
                isOpen && 'col-span-full ring-slate-900/40'
              )}
            >
              <div className="flex items-center gap-2 px-4 pt-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {t.number}
                </span>
                <h3 className="font-semibold text-gray-900">{t.title}</h3>
              </div>
              <div id={panelId} className="flex-1 px-4 py-3">
                {isOpen ? t.detail : t.summary}
              </div>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(t.id)}
                className="flex w-full items-center justify-between rounded-b-xl border-t border-gray-100 px-4 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-gray-50"
              >
                {isOpen ? 'Show less' : 'See details'}
                <span aria-hidden className={cn('transition-transform', isOpen && 'rotate-180')}>▾</span>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
