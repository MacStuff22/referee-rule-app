export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'

interface Props {
  params: Promise<{ sessionId: string }>
}

export default async function ResultsPage({ params }: Props) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) redirect('/quiz')

  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('*, questions(text, rule_number, category, rationale, options, correct_answers, question_type, sub_questions)')
    .eq('session_id', sessionId)

  const total = answers?.length ?? 0
  const correct = answers?.filter((a) => a.is_correct).length ?? 0
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Quiz Complete!</h1>
        <p className="text-5xl font-bold mt-4">{pct}%</p>
        <p className="text-gray-500">{correct} of {total} correct</p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">Review</h2>
        {(answers as any[])?.map((a, i) => {
          const q = a.questions
          const isCompound = q?.question_type === 'compound'

          if (isCompound) {
            const subQs: any[] = q?.sub_questions ?? []
            // Decode -1-separated flat array back into per-sub-question answer arrays
            const rawAnswers: number[] = a.selected_answers ?? []
            const subAnswers: number[][] = rawAnswers
              .reduce<number[][]>((groups, n) => {
                if (n === -1) groups.push([])
                else groups[groups.length - 1].push(n)
                return groups
              }, [[]])
            const allPartsCorrect = subQs.every((sq: any, idx: number) => {
              const userAnswers = subAnswers[idx] ?? []
              const sorted = (arr: number[]) => [...arr].sort().join(',')
              return sorted(userAnswers) === sorted(sq.correct_answers)
            })

            return (
              <Card key={a.id} className={allPartsCorrect ? 'border-green-200' : 'border-red-200'}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium leading-relaxed">
                      {i + 1}. {q?.text}
                    </CardTitle>
                    <Badge variant={allPartsCorrect ? 'default' : 'destructive'} className="shrink-0">
                      {allPartsCorrect ? '✅' : '❌'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {subQs.map((sq: any, sqIdx: number) => {
                    const userAnswerArr = subAnswers[sqIdx] ?? []
                    const sorted = (arr: number[]) => [...arr].sort().join(',')
                    const partCorrect = sorted(userAnswerArr) === sorted(sq.correct_answers)
                    return (
                      <div key={sqIdx} className={`rounded-lg p-3 text-sm space-y-1 ${partCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="font-medium text-gray-800">
                          {partCorrect ? '✅' : '❌'} Part {sqIdx + 1}: {sq.text}
                        </p>
                        {!partCorrect && (
                          <p className="text-gray-600">
                            <span className="font-medium">Correct answer: </span>
                            {sq.correct_answers.map((idx: number) => sq.options[idx]).join(', ')}
                            {userAnswerArr.length > 0 && (
                              <span className="ml-2 text-gray-400">
                                (you chose: {userAnswerArr.map((idx: number) => sq.options[idx]).join(', ')})
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-gray-500"><span className="font-medium">📖 </span>{sq.rationale}</p>
                      </div>
                    )
                  })}
                  <p className="text-xs text-gray-400">Rule {q?.rule_number} · {q?.category}</p>
                </CardContent>
              </Card>
            )
          }

          return (
            <Card key={a.id} className={a.is_correct ? 'border-green-200' : 'border-red-200'}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-relaxed">
                    {i + 1}. {q?.text}
                  </CardTitle>
                  <Badge variant={a.is_correct ? 'default' : 'destructive'} className="shrink-0">
                    {a.is_correct ? '✅' : '❌'}
                  </Badge>
                </div>
              </CardHeader>
              {!a.is_correct && (
                <CardContent className="px-4 pb-4 text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Correct answer: </span>
                    {q?.correct_answers?.map((idx: number) => q.options[idx]).join(', ')}
                  </p>
                  <p><span className="font-medium">📖 </span>{q?.rationale}</p>
                  <p className="text-gray-400">Rule {q?.rule_number} · {q?.category}</p>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <div className="flex gap-3">
        <LinkButton href="/quiz" className="flex-1">Take Another Quiz</LinkButton>
        <LinkButton href="/dashboard" variant="outline" className="flex-1">Back to Dashboard</LinkButton>
      </div>
    </div>
  )
}
