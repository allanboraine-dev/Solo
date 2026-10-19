import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { validateAdminRequest } from '@/utils/adminAuth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Guard /api/admin/* endpoints: Reject unauthorized callers with 401
  if (pathname.startsWith('/api/admin/')) {
    const auth = validateAdminRequest(request)
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Administrative credentials required', reason: auth.reason },
        { status: 401 }
      )
    }
  }

  // 2. Guard /admin/* pages: Redirect unauthenticated public visitors to /admin/login
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const auth = validateAdminRequest(request)
    if (!auth.authorized) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|manifest-driver\\.json|manifest-rider\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3|ogg|ico|json)$).*)',
  ],
}
