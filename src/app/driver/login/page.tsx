"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { isPlatformOwner, isOwnerPassword, FOUNDER_DRIVER_UUID } from '@/utils/owner'
import { setSafeLocalStorageItem } from '@/utils/session'
import { usePWA } from '@/lib/PWAContext'
import { Download, CheckCircle2, Eye, EyeOff, Mail, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

function DriverLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { installApp, isStandalone } = usePWA()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isResetSuccess = searchParams.get('reset') === 'success'
  const isLinkExpired = searchParams.get('error') === 'reset_link_expired'
  const isConfirmed = searchParams.get('confirmed') === 'true'
  const isConfirmationFailed = searchParams.get('error') === 'confirmation_failed'
  const isPendingConfirmation = searchParams.get('registered') === 'pending_confirmation'

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [searchParams])

  const handleResendConfirmation = async () => {
    const targetEmail = email.trim().toLowerCase()
    if (!targetEmail) {
      setError('Please enter your registered email address first to resend the confirmation link.')
      return
    }

    setIsResending(true)
    setResendStatus(null)

    try {
      const supabase = createClient()
      const redirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?next=/driver`
        : undefined

      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      })

      if (resendErr) {
        if (resendErr.message.toLowerCase().includes('rate limit')) {
          setResendStatus({
            success: false,
            message: 'Email rate limit reached. Please wait a minute or check your Spam folder before requesting again.',
          })
        } else {
          setResendStatus({
            success: false,
            message: resendErr.message || 'Failed to resend confirmation email.',
          })
        }
      } else {
        setResendStatus({
          success: true,
          message: `Confirmation email resent to ${targetEmail}! Please check your inbox and Spam/Junk folder.`,
        })
      }
    } catch (err: unknown) {
      setResendStatus({
        success: false,
        message: (err as Error).message || 'An error occurred while resending the confirmation email.',
      })
    } finally {
      setIsResending(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    const supabase = createClient()
    const cleanEmail = email.trim().toLowerCase()

    // Support platform owner login with owner master password (13579)
    if (isPlatformOwner(cleanEmail)) {
      if (isOwnerPassword(password)) {
        try {
          const { data: supaData } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          })
          if (supaData?.user) {
            setSafeLocalStorageItem('driver_id', supaData.user.id)
            router.push('/driver')
            return
          }
        } catch {
          // Fall through to local profile
        }

        // Cache founder profile locally with canonical RFC-4122 UUID so PostgreSQL RPCs (accept_trip) succeed
        const founderProfile = {
          id: FOUNDER_DRIVER_UUID,
          fullName: 'Allan Boraine (Founder)',
          email: cleanEmail,
          phone: '0829245136',
          vehicleMake: 'Kia',
          vehicleModel: 'Sportage',
          vehicleColor: 'Blue',
          licensePlate: 'CWT 143 NC',
          prdpNumber: 'PRDP-FOUNDER-001',
          hasLicense: true,
          hasPrdp: true,
          hasRoadworthy: true,
          isVerified: true,
          subscriptionActive: true,
          subscriptionPlan: 'owner',
        }
        setSafeLocalStorageItem('driver_id', founderProfile.id)
        setSafeLocalStorageItem('mock_driver_profile', JSON.stringify(founderProfile))
        router.push('/driver')
        return
      }

      // If owner email is used with a different password, try Supabase first
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (!authError && data?.user) {
          setSafeLocalStorageItem('driver_id', data.user.id)
          router.push('/driver')
          return
        }
      } catch {
        // Fall through
      }

      setError('Invalid credentials for Platform Owner. Please verify your password.')
      setIsSubmitting(false)
      return
    }
    
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (authError || !data.user) {
      setError(authError?.message || 'Failed to login')
      setIsSubmitting(false)
      return
    }

    // Save driver_id so mockBackend knows who we are locally
    setSafeLocalStorageItem('driver_id', data.user.id);
    
    router.push('/driver')
  }

  return (
    <div className="min-h-mobile-portal bg-gray-50 dark:bg-black p-4 sm:p-6 md:p-8 flex items-center justify-center">
      <div className="max-w-md sm:max-w-lg w-full bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="relative p-1 rounded-[1.35rem] bg-gradient-to-br from-emerald-500 via-teal-400 to-green-600 shadow-xl shadow-emerald-500/25 mx-auto mb-4 w-fit">
            <img
              src="/driver-icon-192.png"
              alt="SOLO Driver Portal"
              className="w-16 h-16 rounded-2xl object-cover border border-white/20"
            />
          </div>
          <h1 className="text-3xl font-black mb-2">Driver Login</h1>
          <p className="text-gray-500">Welcome back to SOLO.</p>
        </div>

        {!isStandalone && (
          <button
            type="button"
            onClick={() => installApp('driver')}
            className="w-full mb-6 px-4 py-3 min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center justify-between gap-2.5 transition active:scale-[0.99] text-left shadow-md shadow-emerald-500/20"
            title="Install SOLO Driver App to your Home Screen"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-white/20 shrink-0">
                <Download size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-black tracking-tight block leading-tight">
                  Install Driver App
                </span>
                <span className="text-[11px] text-emerald-100 font-medium block leading-tight">
                  Add SOLO Driver Portal to your Home Screen
                </span>
              </div>
            </div>
            <span className="text-xs font-black uppercase tracking-wider bg-white text-emerald-700 px-3 py-1.5 rounded-xl shrink-0 shadow-2xs">
              Install
            </span>
          </button>
        )}

        {isResetSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl mb-6 font-medium text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span>
              Your password has been successfully reset! Please sign in with your new password below.
            </span>
          </div>
        )}

        {isConfirmed && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl mb-6 font-medium text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span>
              Your email has been verified successfully! Please enter your password to sign in.
            </span>
          </div>
        )}

        {isPendingConfirmation && (
          <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 p-4 rounded-xl mb-6 font-medium text-sm space-y-2">
            <div className="flex items-start gap-2.5">
              <Mail className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <p className="font-bold">Account Registration Submitted!</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  A verification email was sent to <strong>{email || 'your email'}</strong>. Please check your inbox and <strong>Spam/Junk</strong> folder to confirm your email.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={isResending}
              className="mt-2 text-xs font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-zinc-900 border border-blue-300 dark:border-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-zinc-800 transition flex items-center gap-1.5"
            >
              {isResending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isResending ? 'Resending email...' : 'Resend confirmation email'}
            </button>
          </div>
        )}

        {isConfirmationFailed && (
          <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 p-4 rounded-xl mb-6 font-medium text-sm">
            The email confirmation link was invalid or has expired. You can request a new confirmation email below.
          </div>
        )}

        {isLinkExpired && (
          <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 p-4 rounded-xl mb-6 font-medium text-sm">
            Your password reset link is invalid or has expired. Please request a new link via &ldquo;Forgot password?&rdquo; below.
          </div>
        )}

        {resendStatus && (
          <div className={`p-4 rounded-xl mb-6 font-medium text-sm flex items-start gap-2.5 ${
            resendStatus.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          }`}>
            {resendStatus.success ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            )}
            <span>{resendStatus.message}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 font-medium text-sm space-y-2">
            <div>{error}</div>
            {(error.toLowerCase().includes('not confirmed') || error.toLowerCase().includes('confirm')) && (
              <div className="pt-2 border-t border-red-200 dark:border-red-900/40">
                <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                  Your email address has not been confirmed yet. Please verify your inbox and Spam folder, or click below to resend the confirmation email.
                </p>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResending}
                  className="text-xs font-bold text-red-800 dark:text-red-200 bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-zinc-800 transition inline-flex items-center gap-1.5"
                >
                  {isResending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                  {isResending ? 'Resending...' : 'Resend Confirmation Email'}
                </button>
              </div>
            )}
            {error.toLowerCase().includes('invalid login credentials') && (
              <p className="text-xs text-red-700 dark:text-red-300">
                If your password was recently reset or if your email has not been verified yet, please click{' '}
                <Link href={`/driver/forgot-password?email=${encodeURIComponent(email)}`} className="underline font-bold hover:text-red-800 dark:hover:text-red-200">
                  Forgot password?
                </Link>{' '}
                to receive an instant secure login link.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">Email</label>
            <input 
              required 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-4 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" 
              placeholder="nelson@example.com" 
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold">Password</label>
              <Link 
                href="/driver/forgot-password" 
                className="text-xs font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 transition"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input 
                required 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full p-4 pr-12 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" 
                placeholder="••••••••" 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold p-4 rounded-xl mt-6 flex justify-center items-center gap-2 active:scale-95 transition-all"
          >
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="text-center mt-6 text-gray-500 font-medium">
          Don&apos;t have an account? <Link href="/driver/register" className="text-blue-600 dark:text-blue-400">Register</Link>
        </p>
      </div>
    </div>
  )
}

export default function DriverLogin() {
  return (
    <Suspense fallback={<div className="min-h-mobile-portal bg-gray-50 dark:bg-black" />}>
      <DriverLoginForm />
    </Suspense>
  )
}
