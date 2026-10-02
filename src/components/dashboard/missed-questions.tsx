import { Card, CardContent } from '@/components/ui/card'
import { LinkButton } from '@/components/ui/link-button'
import type { MissedQuestion } from '@/lib/dashboard/metrics'
import { NotEnoughData, SectionHeading } from './primitives'

export function MissedQuestions({ items }: { items: MissedQuestion[] }) {
  return (
    <section className="min-w-0 space-y-3">
      <SectionHeading number={8} title="Questions You Keep Missing">
        Repeat misses point to one idea you haven&apos;t locked in.
      </SectionHeading>
      <Card>
        <CardContent>
          {items.length === 0 ? (
            <NotEnoughData>No repeat misses. Nothing is slipping through.</NotEnoughData>
          ) : (
            <ul className="space-y-2">
              {items.map((m) => (
                <li key={m.questionId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900">{m.text || 'Question'}</p>
                    <p className="text-xs text-gray-500">
                      {m.rule ? `Rule ${m.rule} · ` : ''}
                      {m.category} · Missed {m.misses} times
                    </p>
                  </div>
                  <LinkButton href={`/quiz/${m.lastSessionId}/results`} variant="outline" size="sm">
                    Review
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
