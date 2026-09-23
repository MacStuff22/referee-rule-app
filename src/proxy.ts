import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Never trust a client-supplied value here -- once set below, this header
  // is what route handlers trust as the verified user id instead of
  // re-checking the JWT themselves, so it must only ever come from this
  // middleware having actually called getUser().
  request.headers.delete('x-verified-user-id')

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Public routes — always allow
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/accept-invite') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  ) {
    return supabaseResponse
  }

  // No session → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin-only routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Forward the identity getUser() just verified so route handlers (e.g.
  // /api/quiz/answer) can trust it instead of paying for a second round
  // trip to the Auth server to re-verify the same JWT. Rebuilding the
  // response here (rather than mutating supabaseResponse in place) is
  // required -- NextResponse.next({ request }) snapshots request.headers
  // at call time, so a header set after supabaseResponse was already built
  // wouldn't otherwise be picked up. Any cookies setAll staged onto
  // supabaseResponse above are copied across so session-cookie refresh
  // still works.
  request.headers.set('x-verified-user-id', user.id)
  const finalResponse = NextResponse.next({ request })
  supabaseResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie))
  return finalResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
