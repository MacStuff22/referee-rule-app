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
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string>(undefined)

  useEffect(() => {
    if (!captchaConfigured || widgetIdRef.current) return

    function tryRender() {
      if (!containerRef.current || widgetIdRef.current || !window.turnstile) return false

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        callback: setCaptchaToken,
        'expired-callback': () => setCaptchaToken(''),
      })
      return true
    }

    // The Turnstile script may already be loaded from a page visited earlier
    // in this session — next/script's onLoad only fires on a script's first
    // load, so don't rely on it. Try immediately, then poll briefly for the
    // true first-load case where the script is still in flight.
    if (tryRender()) return

    const interval = setInterval(() => {
      if (tryRender()) clearInterval(interval)
    }, 100)

    return () => clearInterval(interval)
  }, [])

  function reset() {
    setCaptchaToken('')
    window.turnstile?.reset(widgetIdRef.current)
  }

  return {
    captchaToken,
    containerRef,
    reset,
  }
}
