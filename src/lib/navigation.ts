// ============================================================
// Small navigation helpers shared by client components.
// ============================================================

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

/**
 * True when `currentPathname` is already the page `targetUrl` points at
 * (query string and hash are ignored). Used to detect that a client-side
 * `router.push` never actually landed, so a hard navigation can take over.
 */
export function isAtUrl(currentPathname: string, targetUrl: string): boolean {
  try {
    return normalizePath(new URL(targetUrl, 'http://localhost').pathname) === normalizePath(currentPathname)
  } catch {
    return false
  }
}
