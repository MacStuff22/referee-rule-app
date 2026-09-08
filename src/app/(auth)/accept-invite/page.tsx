'use client'

export const dynamic = 'force-dynamic'

import { SetPasswordForm } from '@/components/auth/set-password-form'

export default function AcceptInvitePage() {
  return (
    <SetPasswordForm
      title="Welcome!"
      description="Set your password to activate your account"
      submitLabel="Activate Account"
      loadingLabel="Activating…"
    />
  )
}
