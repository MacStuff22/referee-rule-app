// ============================================================
// Orders a session's answer rows for the results review.
//
// quiz_answers rows come back from Postgres in no guaranteed order when the
// query has no ORDER BY — it follows whatever scan the planner picks (since
// the unique (session_id, question_id) index went in, that's often question
// id order). The session's own question_ids array is the authoritative
// sequence the quiz ran in, so the review is ordered by that instead.
// ============================================================

export function orderByQuizPosition<T extends { question_id: string }>(
  rows: readonly T[],
  questionIds: readonly string[]
): T[] {
  const position = new Map<string, number>()
  questionIds.forEach((id, i) => position.set(id, i))
  const last = questionIds.length

  // Array.prototype.sort is stable, so rows for questions that are somehow
  // not in the list keep their relative order at the end.
  return [...rows].sort((a, b) => (position.get(a.question_id) ?? last) - (position.get(b.question_id) ?? last))
}
