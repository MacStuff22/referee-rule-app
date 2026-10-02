'use client'

import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface GlanceTileSpec {
  id: string
  number: number
  title: string
  /** One-line answer shown on the tile. */
  summary: ReactNode
  /** Full view shown in the pop-up window. */
  detail: ReactNode
}

/**
 * Six fixed tiles. "See details" opens the full view in a pop-up window, so
 * the tiles never move or resize and always stay in number order.
 */
export function GlanceGrid({ tiles }: { tiles: GlanceTileSpec[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const openTile = tiles.find((t) => t.id === openId) ?? null

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Today at a glance</h2>
        <p className="text-sm text-gray-500">Click &ldquo;See details&rdquo; on a tile for the full picture.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <article key={t.id} className="flex min-w-0 flex-col rounded-xl bg-white ring-1 ring-foreground/10">
            <div className="flex items-center gap-2 px-4 pt-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {t.number}
              </span>
              <h3 className="font-semibold text-gray-900">{t.title}</h3>
            </div>
            <div className="flex-1 px-4 py-3">{t.summary}</div>
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex w-full items-center justify-between rounded-b-xl border-t border-gray-100 px-4 py-2.5 text-left text-sm font-medium text-slate-900 hover:bg-gray-50"
            >
              See details
              <span aria-hidden>↗</span>
            </button>
          </article>
        ))}
      </div>

      <Dialog open={openTile !== null} onOpenChange={(open) => { if (!open) setOpenId(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {openTile && (
            <>
              <div className="flex items-center gap-2 pr-8">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {openTile.number}
                </span>
                <DialogTitle className="text-lg font-semibold">{openTile.title}</DialogTitle>
              </div>
              <DialogDescription className="sr-only">Full details for {openTile.title}</DialogDescription>
              <div>{openTile.detail}</div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
