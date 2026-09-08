'use client'

export const dynamic = 'force-dynamic'

import { SetPasswordForm } from '@/components/auth/set-password-form'

export default function ResetPasswordPage() {
  return (
    <SetPasswordForm
      title="Reset your password"
      description="Enter a new password for your account"
      submitLabel="Update Password"
      loadingLabel="Updating…"
    />
  )
}
