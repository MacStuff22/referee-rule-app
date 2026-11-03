import { Badge } from '@/components/ui/badge'
import type { UserStatus } from '@/lib/adminUsers'

// Only people who need attention get a pill, so a regular active person reads
// as calm. The word is always there, so colour is never the only signal. Both
// colour pairs are dark text on a pale tint and clear 4.5:1 for small text.
export default function UserStatusBadge({ status }: { status: UserStatus }) {
  if (status === 'pending') {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900">
        Pending invite
      </Badge>
    )
  }
  if (status === 'deactivated') {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800">
        Deactivated
      </Badge>
    )
  }
  return null
}
