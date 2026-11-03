const COLORS = ['bg-amber-400', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-400', 'bg-violet-500']
const PIECES = 36

/**
 * One burst of confetti over the page. Positions come from the piece number,
 * not Math.random, so the server and browser render the same markup. The
 * motion is in globals.css (.confetti-piece), which also hides it for anyone
 * who prefers reduced motion.
 */
export function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {Array.from({ length: PIECES }, (_, i) => (
        <span
          key={i}
          className={`confetti-piece absolute top-0 block rounded-sm ${COLORS[i % COLORS.length]}`}
          style={
            {
              left: `${(i * 37) % 100}%`,
              width: `${6 + (i % 3) * 2}px`,
              height: `${10 + (i % 4) * 2}px`,
              '--confetti-delay': `${(i % 9) * 0.12}s`,
              '--confetti-duration': `${2.6 + (i % 5) * 0.3}s`,
              '--confetti-drift': `${((i % 7) - 3) * 18}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
