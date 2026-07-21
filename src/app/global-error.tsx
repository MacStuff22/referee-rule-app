'use client'

// Last-resort boundary for errors thrown in the root layout itself. It must
// render its own <html>/<body>, so it uses inline styles rather than the app
// stylesheet (which lives in the layout it is replacing).

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: '#f9fafb',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div style={{ fontSize: '2.25rem' }}>🏒</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.75rem 0 0.25rem', color: '#111827' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              The app hit an unexpected error. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
