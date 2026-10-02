export function ProgressRing({ value, label, size = 140 }: { value: number; label?: string; size?: number }) {
  const r = 56
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={label ?? `${Math.round(clamped * 100)} percent`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="#0f172a"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${clamped * c} ${c}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="78" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  )
}
