import { DASHBOARD_CONFIG, type TrendPoint } from '@/lib/dashboard/metrics'
import { NotEnoughData } from './primitives'

const W = 580
const H = 250
const LEFT = 44
const RIGHT = 560
const TOP = 20
const BOTTOM = 200
const FIRST_X = 70
const LAST_X = 538

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const values = points.flatMap((p) => (p.accuracy === null ? [] : [p.accuracy * 100]))
  if (values.length < 2) {
    return <NotEnoughData>Keep answering questions. Your trend appears once two different two-week stretches have enough answers.</NotEnoughData>
  }

  const goal = DASHBOARD_CONFIG.goalAccuracy * 100
  const lo = Math.max(0, Math.floor((Math.min(...values, goal) - 10) / 10) * 10)
  const hi = 100
  const y = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP)
  const x = (i: number) => FIRST_X + (i * (LAST_X - FIRST_X)) / (points.length - 1)

  const ticks: number[] = []
  for (let t = lo; t <= hi; t += 10) ticks.push(t)

  // Runs of consecutive points with data, so a gap in the history is a gap in the line.
  const runs: { i: number; v: number }[][] = []
  points.forEach((p, i) => {
    if (p.accuracy === null) {
      runs.push([])
    } else {
      if (runs.length === 0) runs.push([])
      runs[runs.length - 1].push({ i, v: p.accuracy * 100 })
    }
  })
  const lines = runs.filter((r) => r.length > 0)
  const lastIdx = points.map((p) => p.accuracy !== null).lastIndexOf(true)
  const firstIdx = points.findIndex((p) => p.accuracy !== null)

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-3xl"
        role="img"
        aria-label={`Accuracy every two weeks, from ${Math.round(values[0])}% to ${Math.round(values[values.length - 1])}%`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
            <text x={LEFT - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#6b7280">{t}%</text>
          </g>
        ))}
        <line x1={LEFT} x2={RIGHT} y1={y(goal)} y2={y(goal)} stroke="#16a34a" strokeWidth="2" strokeDasharray="6 5" />
        <text x={RIGHT - 4} y={y(goal) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="#15803d">
          Goal {Math.round(goal)}%
        </text>
        {lines.map((run, k) => (
          <polyline
            key={k}
            points={run.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
            fill="none"
            stroke="#0f172a"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {points.map((p, i) =>
          p.accuracy === null ? null : (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.accuracy * 100)}
              r={i === lastIdx ? 6.5 : 5}
              fill={i === lastIdx ? '#0f172a' : '#fff'}
              stroke="#0f172a"
              strokeWidth="2.5"
            />
          )
        )}
        {[firstIdx, lastIdx].map((i) => (
          <text key={i} x={x(i)} y={y(points[i].accuracy! * 100) - 12} textAnchor="middle" fontSize="14" fontWeight="700" fill="#111827">
            {Math.round(points[i].accuracy! * 100)}%
          </text>
        ))}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={222} textAnchor="middle" fontSize="12" fill="#6b7280">{p.label}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-2">
        {points.map((p, i) =>
          p.deltaPoints === null ? null : (
            <span key={i} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
              to {p.label}{' '}
              <b className={p.deltaPoints >= 0 ? 'text-green-700' : 'text-red-700'}>
                {p.deltaPoints >= 0 ? '▲' : '▼'} {Math.abs(p.deltaPoints)}
              </b>
            </span>
          )
        )}
      </div>
    </div>
  )
}

/** Tiny version for the closed tile. */
export function TrendSparkline({ points }: { points: TrendPoint[] }) {
  const values = points.flatMap((p, i) => (p.accuracy === null ? [] : [{ i, v: p.accuracy * 100 }]))
  if (values.length < 2) return null
  const min = Math.min(...values.map((p) => p.v))
  const max = Math.max(...values.map((p) => p.v))
  const span = Math.max(max - min, 10)
  const x = (i: number) => 6 + (i * 248) / (points.length - 1)
  const y = (v: number) => 60 - ((v - min) / span) * 48
  const last = values[values.length - 1]
  return (
    <svg viewBox="0 0 260 70" className="h-auto w-full" role="img" aria-label="Accuracy trend">
      <polyline points={values.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="4.5" fill="#0f172a" />
    </svg>
  )
}
