"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react'

export default function DriverForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qEmail = new URLSearchParams(window.location.search).get('email')
      if (qEmail) {
        setEmail(qEmail)
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered email address.')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const redirectTo = `${origin}/auth/callback?next=/driver/reset-password`

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      })

      if (error) {
        setErrorMessage(error.message || 'Unable to send reset email. Please try again.')
        setIsSubmitting(false)
        return
      }

      setSubmittedEmail(cleanEmail)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setErrorMessage(msg)
    } finally {
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
            Reset Driver Password
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your registered email address and we will send you a secure password reset link.
          </p>
        </div>

        {/* Success Card */}
        {submittedEmail ? (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-200 mb-1">
                Password Reset Link Sent!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                We sent an email with reset instructions to:
              </p>
              <p className="font-semibold text-emerald-950 dark:text-emerald-100 text-sm mt-1 bg-white/60 dark:bg-black/40 py-1.5 px-3 rounded-xl inline-block border border-emerald-200/60 dark:border-emerald-700/60">
                {submittedEmail}
              </p>
              <p className="text-[12px] text-emerald-600/80 dark:text-emerald-400/80 mt-3 leading-relaxed">
                Click the link in the email to choose a new password. If it does not arrive within 2 minutes, please check your spam or junk folder.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setSubmittedEmail(null)
                  setEmail('')
                }}
                className="w-full py-3.5 px-4 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-zinc-900 text-gray-700 dark:text-gray-300 text-sm font-bold transition"
              >
                Send to another email
              </button>

              <Link
                href="/driver/login"
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <ArrowLeft size={16} />
                Return to Driver Login
              </Link>
            </div>
          </div>
        ) : (
          /* Input Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold mb-2 text-gray-800 dark:text-gray-200">
                Registered Driver Email
              </label>
              <div className="relative">
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-4 pl-11 bg-gray-100 dark:bg-zinc-900 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none text-gray-900 dark:text-white"
                  placeholder="nelson@example.com"
                />
                <Mail className="absolute left-3.5 top-4 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                This must be the email address you used when registering on SOLO.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold p-4 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
            >
              {isSubmitting ? 'Sending Reset Link...' : 'Send Password Reset Link'}
            </button>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-900 text-center">
              <Link
                href="/driver/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
              >
                <ArrowLeft size={16} />
                Back to Driver Login
              </Link>
            </div>
          </form>
        )}

        {/* Security & Support Note */}
        <div className="mt-8 p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/80 dark:border-zinc-800/80 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Need help? If you no longer have access to your email address, contact SOLO Driver Support with your verified cellphone number and vehicle licence plate.
          </p>
        </div>

      </div>
    </div>
  )
}
