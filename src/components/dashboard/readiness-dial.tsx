const ARC_LENGTH = Math.PI * 80

/** Red -> yellow -> green by score, same bands as the readiness labels (40 / 60 / 80). */
export function dialColor(score: number): string {
  if (score < 40) return '#dc2626' // red
  if (score < 60) return '#eab308' // yellow
  if (score < 80) return '#84cc16' // light green
  return '#16a34a' // green
}

export function ReadinessDial({ score, size = 'large' }: { score: number | null; size?: 'small' | 'large' }) {
  const filled = score === null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * ARC_LENGTH
  return (
    <svg
      viewBox="0 0 200 125"
      className={size === 'large' ? 'w-full max-w-md' : 'w-full max-w-[13rem]'}
      role="img"
      aria-label={score === null ? 'Readiness score not available yet' : `Readiness score ${score} out of 100`}
    >
      <path d="M20 105 A80 80 0 0 1 180 105" fill="none" stroke="#f3f4f6" strokeWidth="16" strokeLinecap="round" />
      {score !== null && score > 0 && (
        <path
          d="M20 105 A80 80 0 0 1 180 105"
          fill="none"
          stroke={dialColor(score)}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC_LENGTH + 1}`}
        />
      )}
      <text x="100" y="98" textAnchor="middle" fontSize="48" fontWeight="700" fill="#111827">
        {score ?? '–'}
      </text>
      {size === 'large' && (
        <>
          <text x="20" y="122" textAnchor="middle" fontSize="12" fill="#6b7280">0</text>
          <text x="180" y="122" textAnchor="middle" fontSize="12" fill="#6b7280">100</text>
        </>
      )}
    </svg>
  )
}
