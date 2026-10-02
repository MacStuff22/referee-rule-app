import { cn } from '@/lib/utils'
import type { CalendarWeek } from '@/lib/dashboard/metrics'

const LEVEL_CLASS = [
  'bg-gray-100 text-gray-500',
  'bg-blue-100 text-slate-900',
  'bg-blue-300 text-blue-950',
  'bg-blue-800 text-white',
]

export function ActivityCalendar({ weeks }: { weeks: CalendarWeek[] }) {
  return (
    <div>
      <div
        className="grid max-w-md grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] items-center gap-1"
        role="img"
        aria-label="Study activity calendar for the last 12 weeks"
      >
        <span />
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-center text-xs font-semibold text-gray-500">{d}</span>
        ))}
        {weeks.map((w) => (
          <Week key={w.label} week={w} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        {['No study', 'A little', 'Solid', 'Big day'].map((l, i) => (
          <span key={l} className="flex items-center gap-1.5">
            <i className={cn('inline-block size-3 rounded-[3px]', LEVEL_CLASS[i].split(' ')[0])} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

function Week({ week }: { week: CalendarWeek }) {
  return (
    <>
      <span className="pr-1 text-right text-xs text-gray-500">{week.label}</span>
      {week.cells.map((c) => (
        <span
          key={c.key}
          className={cn(
            'grid aspect-square place-items-center rounded-[5px] text-[11px] tabular-nums',
            c.isFuture ? 'border border-dashed border-gray-200 text-gray-300' : LEVEL_CLASS[c.level],
            c.isToday && 'bg-white font-bold text-slate-900 outline-2 outline-offset-1 outline-slate-900'
          )}
        >
          {c.day}
        </span>
      ))}
    </>
  )
}
