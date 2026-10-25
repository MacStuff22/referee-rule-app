// ============================================================
// What the Study Plan start button says — and therefore promises.
//
// Clicking it POSTs to api/quiz/paths/[pathId]/start, which does one of three
// things, in this order: resume an unfinished quiz, mark the plan complete when
// nothing is left to cover, or build a new quiz. The label must describe
// whichever of those will actually happen, with the same question count the
// builder will use (see planTodaysQuiz in paths.ts).
// ============================================================

export interface StartButtonInput {
  /** From planTodaysQuiz — how many questions a new quiz will have. */
  questionCount: number
  /** Questions in the plan not yet covered. */
  uncoveredCount: number
  /** The newest unfinished quiz for this plan, if any (the one the route resumes). */
  inProgress: { total: number; currentIndex: number } | null
}

export interface StartButtonLabels {
  label: string
  loadingLabel: string
}

export function startButtonLabels({ questionCount, uncoveredCount, inProgress }: StartButtonInput): StartButtonLabels {
  if (inProgress) {
    const question = Math.min(Math.max(inProgress.currentIndex, 0) + 1, inProgress.total)
    return {
      label: `Continue Your Quiz — Question ${question} of ${inProgress.total}`,
      loadingLabel: 'Opening your quiz…',
    }
  }
  if (uncoveredCount <= 0) {
    return { label: 'Finish This Plan', loadingLabel: 'Finishing…' }
  }
  return {
    label: `Do Today's ${questionCount} Question${questionCount === 1 ? '' : 's'}`,
    loadingLabel: "Building today's questions…",
  }
}
