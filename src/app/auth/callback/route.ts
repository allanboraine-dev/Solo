import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const nextParam = requestUrl.searchParams.get('next')

  // Smart fallback based on auth action type
  const defaultNext = type === 'recovery' ? '/driver/reset-password' : '/driver/login?confirmed=true'
  const next = nextParam || defaultNext

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  // If code exchange failed or no code, return to login with contextual notice
  const errorReason = type === 'recovery' ? 'reset_link_expired' : 'confirmation_failed'
  return NextResponse.redirect(
    new URL(`/driver/login?error=${errorReason}`, requestUrl.origin)
  )
}
