import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { StudyPlanItem, StudyPlanKind } from '@/lib/dashboard/metrics'
import { PracticeButton } from './practice-button'
import { NotEnoughData, SectionHeading } from './primitives'

const KIND: Record<StudyPlanKind, { label: string; className: string }> = {
  weak: { label: 'Weak spot', className: 'bg-red-100 text-red-800' },
  fading: { label: 'Fading', className: 'bg-amber-100 text-amber-800' },
  new: { label: 'Not started', className: 'bg-blue-100 text-blue-800' },
}

export function StudyPlan({ items }: { items: StudyPlanItem[] }) {
  return (
    <section className="space-y-3">
      <SectionHeading number={4} title="Your Study Plan">
        The topics to refresh next. Reviewing just as something starts to fade, and testing yourself, beats re-reading.
      </SectionHeading>
      <Card>
        <CardContent className="space-y-1">
          {items.length === 0 ? (
            <NotEnoughData>
              Nothing needs attention right now. Take a quiz to keep your knowledge fresh.
            </NotEnoughData>
          ) : (
            <>
              <ol className="divide-y divide-gray-100">
                {items.map((item, i) => (
                  <li key={item.category} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <span className="w-5 text-sm font-bold text-gray-400">{i + 1}</span>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-semibold text-gray-900">{item.category}</p>
                      <p className="text-sm text-gray-500">
                        <span className={cn('mr-2 rounded-full px-2 py-0.5 text-xs font-semibold', KIND[item.kind].className)}>
                          {KIND[item.kind].label}
                        </span>
                        {item.reason}
                        {item.rules.length > 0 && (
                          <span className="text-gray-400"> · {item.rules.length === 1 ? 'Rule' : 'Rules'} {item.rules.join(', ')}</span>
                        )}
                      </p>
                    </div>
                    <PracticeButton categories={[item.category]}>Practice</PracticeButton>
                  </li>
                ))}
              </ol>
              {items.length > 1 && (
                <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
                  <PracticeButton categories={items.map((i) => i.category)} sessionLength="standard" variant="outline">
                    Mixed review of all {items.length}
                  </PracticeButton>
                  <span className="text-xs text-gray-500">Mixing topics feels harder but helps you remember longer.</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
