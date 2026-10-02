import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { StrengthSection, TileStatus } from '@/lib/dashboard/metrics'
import { SectionHeading } from './primitives'

// Red -> yellow -> green: worst to best. "Not started" stays neutral gray.
const TILE: Record<TileStatus, { className: string; label: string }> = {
  mastered: { className: 'bg-green-600 text-white', label: 'Mastered' },
  proficient: { className: 'bg-lime-300 text-lime-950', label: 'Solid' },
  learning: { className: 'bg-yellow-200 text-yellow-950', label: 'Just learning' },
  developing: { className: 'bg-red-500 text-white', label: 'Needs work' },
  new: { className: 'border border-dashed border-gray-400 bg-white text-gray-500', label: 'Not started' },
}

const LEGEND: TileStatus[] = ['developing', 'learning', 'proficient', 'mastered', 'new']

export function StrengthMap({ sections }: { sections: StrengthSection[] }) {
  return (
    <section className="space-y-3">
      <SectionHeading number={5} title="Strengths & Weaknesses Map">
        The whole rulebook at a glance. Red tiles are where the gaps are; green tiles are your strengths.
      </SectionHeading>
      <Card>
        <CardContent className="space-y-4">
          {sections.map((s) => (
            <div key={s.section}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{s.section}</p>
              <ul className="flex flex-wrap gap-1.5">
                {s.tiles.map((t) => (
                  <li
                    key={t.category}
                    title={`${t.category}: ${TILE[t.status].label}`}
                    className={cn('rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight', TILE[t.status].className)}
                  >
                    {t.status === 'developing' && <span aria-hidden>! </span>}
                    {t.category}
                    <span className="sr-only"> ({TILE[t.status].label})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
            {LEGEND.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <i className={cn('inline-block size-3 rounded-[3px]', TILE[k].className)} />
                {k === 'developing' ? '! ' : ''}
                {TILE[k].label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
