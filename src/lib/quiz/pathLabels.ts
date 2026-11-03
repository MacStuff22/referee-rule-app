// Plain-language labels for a Study Plan, shared by the plans list and a plan's own page.

const MS_PER_DAY = 86_400_000

export const POOL_LABEL: Record<string, string> = {
  situation_book: 'Situation Book',
  categories: 'Selected Rules',
  weak_areas: 'Weaknesses',
  missed_questions: 'Missed questions',
}

/**
 * A plan's stored date (YYYY-MM-DD) as "Nov 29, 2026". Read as the calendar
 * date it is, so it can't slip a day in a time zone behind UTC.
 */
export function formatPlanDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export interface DueDescription {
  text: string
  /** 'late' means past the due date. */
  tone: 'normal' | 'soon' | 'late'
}

/** How far off a due date is from today (both YYYY-MM-DD, today in the viewer's time zone). The due date itself is still a study day. */
export function describeDue(dueDate: string, today: string): DueDescription {
  const days = Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / MS_PER_DAY)
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, tone: 'late' }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: days <= 3 ? 'soon' : 'normal' }
}
