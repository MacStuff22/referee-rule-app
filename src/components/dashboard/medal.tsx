import { Award, Crown, Medal as MedalIcon, ShieldCheck, Target, Trophy, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Badge } from '@/lib/dashboard/metrics'

interface Look {
  icon: LucideIcon
  /** Ring + fill, Apple-Fitness-style: a saturated gradient disc with a white glyph. */
  gradient: string
}

const QUESTION_LOOKS: Record<number, Look> = {
  100: { icon: Target, gradient: 'from-sky-400 to-blue-600' },
  250: { icon: MedalIcon, gradient: 'from-emerald-400 to-teal-600' },
  500: { icon: Award, gradient: 'from-amber-400 to-orange-600' },
  1000: { icon: Crown, gradient: 'from-fuchsia-500 to-purple-700' },
}

function lookFor(badge: Pick<Badge, 'kind' | 'target'>): Look {
  if (badge.kind === 'best-week') return { icon: Zap, gradient: 'from-yellow-300 to-orange-500' }
  if (badge.kind === 'mastered') return { icon: ShieldCheck, gradient: 'from-green-400 to-green-700' }
  return QUESTION_LOOKS[badge.target ?? 0] ?? { icon: Trophy, gradient: 'from-slate-500 to-slate-800' }
}

export function Medal({
  badge,
  size = 'md',
  locked = false,
}: {
  badge: Pick<Badge, 'kind' | 'target'>
  size?: 'sm' | 'md'
  locked?: boolean
}) {
  const { icon: Icon, gradient } = lookFor(badge)
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'size-9' : 'size-14',
        locked
          ? 'border-2 border-dashed border-gray-300 bg-gray-100 text-gray-400'
          : cn('bg-gradient-to-br text-white shadow-md ring-2 ring-white', gradient)
      )}
    >
      <Icon className={size === 'sm' ? 'size-[18px]' : 'size-7'} strokeWidth={2.25} />
    </span>
  )
}
