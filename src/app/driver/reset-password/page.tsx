"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { setSafeLocalStorageItem } from '@/utils/session'
import { 
  KeyRound, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  ShieldCheck,
  Loader2
} from 'lucide-react'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [hasValidSession, setHasValidSession] = useState(false)

  useEffect(() => {
    let isMounted = true
    const supabase = createClient()

    async function initRecoverySession() {
      try {
        const code = searchParams.get('code')
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeErr) {
            console.warn('Session code exchange warning:', exchangeErr.message)
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        if (isMounted) {
          if (sessionData?.session?.user) {
            setHasValidSession(true)
          }
          setIsInitializing(false)
        }
      } catch (err) {
        console.warn('Recovery initialization warning:', err)
        if (isMounted) {
          setIsInitializing(false)
        }
      }
    }

    // Also listen to auth state changes (e.g. PASSWORD_RECOVERY event)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return
        if (event === 'PASSWORD_RECOVERY' || (session && session.user)) {
          setHasValidSession(true)
        }
      }
    )

    initRecoverySession()

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [searchParams])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) {
        setErrorMessage(error.message || 'Failed to update password. Your reset link may have expired.')
        setIsSubmitting(false)
        return
      }

      if (data?.user?.id) {
        setSafeLocalStorageItem('driver_id', data.user.id)
      }

      setIsSuccess(true)

      // Automatically redirect after 3 seconds
      setTimeout(() => {
        router.push('/driver/login?reset=success')
      }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setErrorMessage(msg)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-mobile-portal bg-gray-50 dark:bg-black p-4 sm:p-6 md:p-8 flex items-center justify-center">
      <div className="max-w-md sm:max-w-lg w-full bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="relative p-3 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-green-600 shadow-xl shadow-emerald-500/25 mx-auto mb-4 w-fit text-white">
            <KeyRound size={28} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mb-2 text-gray-900 dark:text-white">
            Set New Password
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create a strong, secure password for your SOLO Driver account.
          </p>
        </div>

        {isInitializing ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-xs font-semibold">Verifying secure reset token...</p>
          </div>
        ) : isSuccess ? (
          /* Success Screen */
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-200 mb-1">
                Password Successfully Reset!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">
                Your SOLO Driver account password has been updated. You can now use your new password to sign in.
              </p>
              <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 mt-3 font-medium">
                Redirecting to login in 3 seconds...
              </p>
            </div>

            <Link
              href="/driver/login?reset=success"
              className="w-full py-4 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-blue-500/20"
            >
              Continue to Login Now
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          /* Password Input Form */
          <form onSubmit={handleResetPassword} className="space-y-4">
            {errorMessage && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {!hasValidSession && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Please make sure you arrived here via the reset link sent to your email. If your link has expired, request a new one below.
                </span>
              </div>
            )}

            {/* New Password */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-800 dark:text-gray-200">
                New Password
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 pl-11 pr-11 bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none text-gray-900 dark:text-white"
                  placeholder="At least 6 characters"
                  minLength={6}
                />
                <Lock className="absolute left-3.5 top-4 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-800 dark:text-gray-200">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-4 pl-11 pr-11 bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none text-gray-900 dark:text-white"
                  placeholder="Re-enter new password"
                  minLength={6}
                />
                <Lock className="absolute left-3.5 top-4 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold p-4 rounded-xl mt-2 flex justify-center items-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Updating Password...
                </>
              ) : (
                'Save New Password'
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                href="/driver/forgot-password"
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              >
                Need a new reset link? Click here
              </Link>
            </div>
          </form>
        )}

        {/* Security Footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-900 flex items-center justify-center gap-2 text-gray-400 text-xs">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Encrypted with bank-grade SSL and Supabase Auth</span>
        </div>

      </div>
    </div>
  )
}

export default function DriverResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-mobile-portal bg-gray-50 dark:bg-black flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-sm font-semibold">Loading...</span>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
