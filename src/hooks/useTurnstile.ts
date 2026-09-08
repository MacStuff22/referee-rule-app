'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
        }
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

// Unset in local/dev environments that haven't configured a Turnstile site —
// captchaConfigured lets callers skip rendering the widget entirely.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
export const captchaConfigured = Boolean(TURNSTILE_SITE_KEY)

export function useTurnstile() {
  const [captchaToken, setCaptchaToken] = useState('')
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string>(undefined)

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || widgetIdRef.current || !window.turnstile) {
      return
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY!,
      callback: setCaptchaToken,
      'expired-callback': () => setCaptchaToken(''),
    })
  }, [scriptLoaded])

  function reset() {
    setCaptchaToken('')
    window.turnstile?.reset(widgetIdRef.current)
  }

  return {
    captchaToken,
    containerRef,
    onScriptLoad: () => setScriptLoaded(true),
    reset,
  }
}
