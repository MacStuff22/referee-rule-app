export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { decodeCompoundAnswer, decodeScoreboardAnswer } from '@/lib/quiz/answers'
import { parseScoreboardConfig } from '@/types/scoreboard'
import { formatGT } from '@/lib/scoreboard'
import { orderByQuizPosition } from '@/lib/quiz/review'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIDEO_BUCKET, VIDEO_SIGNED_URL_SECONDS, isValidVideoPath } from '@/lib/video'

/** Collapsed by default with preload="none", so a review page full of clips downloads nothing until one is opened. */
function ReviewClip({ url }: { url: string | undefined }) {
  if (!url) return null
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">🎥 Watch the clip</summary>
      <video
        src={url}
        controls
        preload="none"
        playsInline
        disablePictureInPicture
        controlsList="nodownload"
        className="mt-2 w-full rounded-lg bg-black"
      />
    </details>
  )
}

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

  const { data: answerRows, error: answersError } = await supabase
    .from('quiz_answers')
    .select('*, questions(text, rule_number, category, rationale, options, correct_answers, question_type, sub_questions, video_path)')
    .eq('session_id', sessionId)

  // A failed load must not render as an empty quiz ("0 of 0 correct") — that
  // reads as lost progress when the answers are in fact saved.
  if (answersError) {
    console.error('Failed to load quiz results:', answersError.message)
    return (
      <div className="max-w-2xl mx-auto space-y-4 text-center pt-10">
        <h1 className="text-2xl font-bold text-gray-900">We couldn&apos;t load your results</h1>
        <p className="text-gray-500">
          Your answers were saved — this is a display problem. Please try again in a moment.
        </p>
        <LinkButton href="/dashboard" variant="outline">Back to Dashboard</LinkButton>
      </div>
    )
  }

  // Rows arrive in no guaranteed order — review in the order the quiz ran.
  const answers = orderByQuizPosition(answerRows ?? [], session.question_ids as string[])

  // Signed URLs for any clips in this review. The answer rows above were read
  // under the user's own RLS, so only clips from questions they were actually
  // served get signed.
  const videoUrlByQuestionId = new Map<string, string>()
  type ClipRow = { question_id: string; questions: { video_path: string } }
  const clipRows = (answers as unknown as ClipRow[]).filter((a) => isValidVideoPath(a.questions?.video_path))
  if (clipRows.length > 0) {
    const paths = [...new Set<string>(clipRows.map((a) => a.questions.video_path))]
    const { data: signed } = await createAdminClient()
      .storage.from(VIDEO_BUCKET)
      .createSignedUrls(paths, VIDEO_SIGNED_URL_SECONDS)
    const urlByPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]))
    for (const a of clipRows) {
      const url = urlByPath.get(a.questions.video_path)
      if (url) videoUrlByQuestionId.set(a.question_id, url)
    }
  }

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
          const isScoreboard = q?.question_type === 'scoreboard'

          if (isCompound) {
            const subQs: any[] = q?.sub_questions ?? []
            const subAnswers: number[][] = decodeCompoundAnswer(a.selected_answers)
            const allPartsCorrect = subQs.every((sq: any, idx: number) => {
              const userAnswers = subAnswers[idx] ?? []
              const sorted = (arr: number[]) => [...arr].sort().join(',')
              return sorted(userAnswers) === sorted(sq.correct_answers)
            })

            return (
              <Card key={a.id} className={allPartsCorrect ? 'border-green-200' : 'border-red-200'}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium leading-relaxed whitespace-pre-line">
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
                        <p className="font-medium text-gray-800 whitespace-pre-line">
                          {partCorrect ? '✅' : '❌'} Part {sqIdx + 1}: {sq.text}
                        </p>
                        {!partCorrect && (
                          <p className="text-gray-600 whitespace-pre-line">
                            <span className="font-medium">Correct answer: </span>
                            {sq.correct_answers.map((idx: number) => sq.options[idx]).join(', ')}
                            {userAnswerArr.length > 0 && (
                              <span className="ml-2 text-gray-400">
                                (you chose: {userAnswerArr.map((idx: number) => sq.options[idx]).join(', ')})
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-gray-500 whitespace-pre-line"><span className="font-medium">📖 </span>{sq.rationale}</p>
                      </div>
                    )
                  })}
                  <ReviewClip url={videoUrlByQuestionId.get(a.question_id)} />
                  <p className="text-xs text-gray-400">Rule {q?.rule_number} · {q?.category}</p>
                </CardContent>
              </Card>
            )
          }

          if (isScoreboard) {
            const config = parseScoreboardConfig(q?.sub_questions?.[0])
            const activePlayers = config?.player_answers.filter((p) => !p.already_expired) ?? []
            const entries = decodeScoreboardAnswer(a.selected_answers)
            const isCoincidental = config?.situation_type === 'coincidental'

            return (
              <Card key={a.id} className={a.is_correct ? 'border-green-200' : 'border-red-200'}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium leading-relaxed whitespace-pre-line">
                      {i + 1}. {q?.text}
                    </CardTitle>
                    <Badge variant={a.is_correct ? 'default' : 'destructive'} className="shrink-0">
                      {a.is_correct ? '✅' : '❌'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {activePlayers.map((p, idx) => {
                    const entry = entries[idx]
                    const partCorrect = entry
                      ? (p.wash_out ? entry.washOut : (!entry.washOut && entry.secs === p.correct_secs))
                      : false
                    const correctLabel = p.wash_out
                      ? (isCoincidental ? 'Coincidental Penalty' : 'Wash Out')
                      : formatGT(p.correct_secs)
                    const userLabel = !entry
                      ? '—'
                      : entry.washOut
                        ? (isCoincidental ? 'Coincidental Penalty' : 'Wash Out')
                        : entry.secs != null ? formatGT(entry.secs) : '—'
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg p-2.5 text-sm flex items-center gap-2 flex-wrap ${partCorrect ? 'bg-green-50' : 'bg-red-50'}`}
                      >
                        <span className="font-medium text-gray-800">
                          {partCorrect ? '✅' : '❌'} {p.team} #{p.player}
                        </span>
                        <span className="text-gray-600 font-mono">Correct: {correctLabel}</span>
                        {!partCorrect && (
                          <span className="text-gray-400 font-mono">you: {userLabel}</span>
                        )}
                      </div>
                    )
                  })}
                  <p className="text-gray-500 text-sm whitespace-pre-line"><span className="font-medium">📖 </span>{q?.rationale}</p>
                  <p className="text-xs text-gray-400">Rule {q?.rule_number} · {q?.category}</p>
                </CardContent>
              </Card>
            )
          }

          return (
            <Card key={a.id} className={a.is_correct ? 'border-green-200' : 'border-red-200'}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-relaxed whitespace-pre-line">
                    {i + 1}. {q?.text}
                  </CardTitle>
                  <Badge variant={a.is_correct ? 'default' : 'destructive'} className="shrink-0">
                    {a.is_correct ? '✅' : '❌'}
                  </Badge>
                </div>
              </CardHeader>
              {!a.is_correct && (
                <CardContent className="px-4 pb-4 text-sm text-gray-600 space-y-1">
                  <p className="whitespace-pre-line"><span className="font-medium">Correct answer: </span>
                    {q?.correct_answers?.map((idx: number) => q.options[idx]).join(', ')}
                  </p>
                  <p className="whitespace-pre-line"><span className="font-medium">📖 </span>{q?.rationale}</p>
                  <p className="text-gray-400">Rule {q?.rule_number} · {q?.category}</p>
                </CardContent>
              )}
              {videoUrlByQuestionId.has(a.question_id) && (
                <CardContent className="px-4 pb-4">
                  <ReviewClip url={videoUrlByQuestionId.get(a.question_id)} />
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
