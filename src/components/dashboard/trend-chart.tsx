'use client'

import { useState } from 'react'
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
  const [active, setActive] = useState<number | null>(null)

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

  const tip = active !== null ? points[active] : null

  return (
    <div className="relative w-full max-w-3xl">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Accuracy every two weeks, from ${Math.round(values[0])}% to ${Math.round(values[values.length - 1])}%. Hover or tap a dot for details.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
            <text x={LEFT - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#6b7280">{t}%</text>
          </g>
        ))}
        <line x1={LEFT} x2={RIGHT} y1={y(goal)} y2={y(goal)} stroke="#16a34a" strokeWidth="2" strokeDasharray="6 5" />
        <text x={LEFT + 6} y={y(goal) - 6} textAnchor="start" fontSize="12" fontWeight="700" fill="#15803d">
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
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={222} textAnchor="middle" fontSize="12" fill="#6b7280">{p.label}</text>
        ))}
        {points.map((p, i) =>
          p.accuracy === null ? null : (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(p.accuracy * 100)}
                r={active === i ? 8 : i === lastIdx ? 6.5 : 5}
                fill={i === lastIdx || active === i ? '#0f172a' : '#fff'}
                stroke="#0f172a"
                strokeWidth="2.5"
              />
              {/* Larger invisible target so dots are easy to hover, tap or tab to. */}
              <circle
                cx={x(i)}
                cy={y(p.accuracy * 100)}
                r="16"
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${p.label}: ${Math.round(p.accuracy * 100)}% from ${p.total} answers`}
                className="cursor-pointer outline-none focus-visible:stroke-slate-900"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
              />
            </g>
          )
        )}
      </svg>

      {tip && active !== null && tip.accuracy !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: `${Math.min(Math.max((x(active) / W) * 100, 16), 84)}%`,
            top: `${(y(tip.accuracy * 100) / H) * 100}%`,
            marginTop: -14,
          }}
        >
          <p className="text-[11px] text-slate-300">Two weeks ending {tip.label}</p>
          <p className="text-base font-bold">{Math.round(tip.accuracy * 100)}%</p>
          <p className="text-slate-300">{tip.total} answers</p>
          {tip.deltaPoints !== null && (
            <p className={tip.deltaPoints >= 0 ? 'text-green-300' : 'text-red-300'}>
              {tip.deltaPoints === 0
                ? 'No change'
                : `${tip.deltaPoints > 0 ? '▲' : '▼'} ${Math.abs(tip.deltaPoints)} ${Math.abs(tip.deltaPoints) === 1 ? 'point' : 'points'}`}{' '}
              <span className="text-slate-300">vs. previous</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Small version for the tile: real axes (percent ticks on the left, dates along the bottom) so the line reads as data. */
export function TrendSparkline({ points }: { points: TrendPoint[] }) {
  const pts = points.flatMap((p, i) => (p.accuracy === null ? [] : [{ i, v: p.accuracy * 100, label: p.label }]))
  if (pts.length < 2) return null

  const vw = 280
  const vh = 118
  const left = 34
  const right = 268
  const top = 10
  const bottom = 88

  const dataMin = Math.min(...pts.map((p) => p.v))
  const dataMax = Math.max(...pts.map((p) => p.v))
  const lo = Math.max(0, Math.floor((dataMin - 5) / 10) * 10)
  const hi = Math.min(100, Math.max(lo + 20, Math.ceil((dataMax + 5) / 10) * 10))
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
  const x = (i: number) => left + 8 + (i * (right - left - 16)) / (points.length - 1)
  const mid = Math.round((lo + hi) / 2)
  const last = pts[pts.length - 1]
  const labelIdx = new Set([pts[0].i, points.length - 1])
  // Middle date label only when it lands on a real point.
  const midPoint = pts.find((p) => p.i === Math.floor((points.length - 1) / 2))
  if (midPoint) labelIdx.add(midPoint.i)

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="h-auto w-full" role="img" aria-label="Accuracy trend over the last 12 weeks">
      {[lo, mid, hi].map((t) => (
        <g key={t}>
          <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
          <text x={left - 5} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">{t}%</text>
        </g>
      ))}
      <line x1={left} x2={left} y1={top} y2={bottom} stroke="#d1d5db" />
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#d1d5db" />
      {points.map((p, i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1={bottom} y2={bottom + 4} stroke="#d1d5db" />
          {labelIdx.has(i) && (
            <text x={x(i)} y={bottom + 16} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#6b7280">
              {p.label}
            </text>
          )}
        </g>
      ))}
      <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p === last ? 4 : 2.5} fill={p === last ? '#0f172a' : '#fff'} stroke="#0f172a" strokeWidth="1.5" />
      ))}
      <text x={x(last.i)} y={y(last.v) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="#111827">{Math.round(last.v)}%</text>
    </svg>
  )
}
