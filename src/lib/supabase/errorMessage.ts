// Maps known Supabase auth error codes to plain-language copy. Anything not
// in this list falls back to a generic message rather than ever showing
// Supabase's raw internal error text to an end user — that fallback is what
// actually guarantees no leak, the specific mappings below are just a nicer
// experience layered on top.
const FRIENDLY_MESSAGES: Record<string, string> = {
  weak_password: 'That password is too weak — try a longer or less common one.',
  same_password: "That's already your current password — try a different one.",
  over_email_send_rate_limit: 'Too many attempts — please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts — please wait a few minutes and try again.',
  captcha_failed: 'Verification failed — please try again.',
  email_address_invalid: "That doesn't look like a valid email address.",
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.'

export function friendlyAuthError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return ''
  return FRIENDLY_MESSAGES[error.code ?? ''] ?? GENERIC_MESSAGE
}
