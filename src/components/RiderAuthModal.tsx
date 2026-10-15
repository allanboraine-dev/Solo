"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { formatPhoneNumber, isValidSAPhone } from '@/utils/phone'
import { Smartphone, ShieldCheck, ArrowRight, X, AlertCircle, RefreshCw, MessageCircle } from 'lucide-react'

interface RiderAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: any) => void
}

export default function RiderAuthModal({ isOpen, onClose, onSuccess }: RiderAuthModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [formattedPhone, setFormattedPhone] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [smsNotice, setSmsNotice] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  if (!isOpen) return null

  const handleSendOtp = async (e?: React.FormEvent, overrideChannel?: 'whatsapp' | 'sms') => {
    if (e) e.preventDefault()
    setError(null)
    setSmsNotice(null)
    const targetChannel = overrideChannel || channel

    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }

    if (!isValidSAPhone(phone)) {
      setError('Please enter a valid 10-digit South African mobile number (e.g. 082 123 4567)')
      return
    }

    const e164 = formatPhoneNumber(phone)
    setFormattedPhone(e164)
    setIsLoading(true)

    try {
      const { data, error: otpError } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: {
          channel: targetChannel,
          data: {
            full_name: fullName.trim(),
            user_type: 'rider',
          },
        },
      })

      if (otpError) {
        // Check if error is related to unconfigured SMS provider in Supabase
        const msg = otpError.message.toLowerCase()
        if (msg.includes('sms') || msg.includes('provider') || msg.includes('twilio') || msg.includes('gateway') || msg.includes('unsupported') || msg.includes('whatsapp') || msg.includes('channel')) {
          setSmsNotice(
            `Notice: Your Supabase project needs a phone provider (Twilio Verify) enabled to send live ${targetChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} passcodes. You can sign in using a demo session below for instant testing.`
          )
        }
        throw otpError
      }

      setStep('otp')
      setCountdown(45)
    } catch (err: any) {
      setError(err?.message || `Failed to send verification code via ${targetChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}. Please try again.`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!otp || otp.trim().length < 6) {
      setError('Please enter the 6-digit verification code')
      return
    }

    setIsLoading(true)

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp.trim(),
        type: 'sms',
      })

      if (verifyError || !data.user) {
        throw verifyError || new Error('Invalid verification code')
      }

      // Upsert rider profile
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName.trim(),
        phone: formattedPhone,
        user_type: 'rider',
      })

      onSuccess(data.user)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired OTP code.')
    } finally {
      setIsLoading(false)
    }
  }

  // Developer / Demo Bypass if Supabase SMS provider is not yet set up
  const handleDevBypass = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // In development fallback, create a rider session or set local demo profile
      const demoEmail = `rider_${formattedPhone.replace(/[^\d]/g, '')}@solorides.co.za`
      const demoPassword = 'SoloRiderTestPass2026!'

      // Try signing in or signing up with demo email behind the scenes
      let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      })

      if (signInError) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPassword,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: formattedPhone,
              user_type: 'rider',
            },
          },
        })
        if (signUpError) throw signUpError
        signInData = signUpData as any
      }

      if (signInData?.user) {
        await supabase.from('profiles').upsert({
          id: signInData.user.id,
          full_name: fullName.trim(),
          phone: formattedPhone,
          user_type: 'rider',
        })
        onSuccess(signInData.user)
        onClose()
      }
    } catch (err: any) {
      setError('Dev login failed: ' + (err?.message || 'Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 w-full max-w-md rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden relative animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-zinc-900 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="p-8 pb-4">
          <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
            {step === 'phone' ? <Smartphone size={28} /> : <ShieldCheck size={28} />}
          </div>
          <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            {step === 'phone' ? 'Enter Your Mobile Number' : 'Enter Verification Code'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
            {step === 'phone'
              ? 'We will send a one-time passcode to verify your phone number.'
              : `We sent a 6-digit passcode via ${channel === 'whatsapp' ? 'WhatsApp 💬' : 'SMS 📱'} to ${formattedPhone}`}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-8 mb-4 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-2xl text-xs font-semibold flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* SMS / WhatsApp Provider Missing Notice */}
        {smsNotice && (
          <div className="mx-8 mb-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 rounded-2xl text-xs">
            <p className="font-bold mb-1">Notice for Developer / Admin:</p>
            <p className="leading-relaxed mb-3">{smsNotice}</p>
            <button
              onClick={handleDevBypass}
              disabled={isLoading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 rounded-xl font-bold transition text-xs shadow-sm flex items-center justify-center gap-1.5"
            >
              {isLoading ? 'Connecting...' : 'Sign In with Demo Session (Bypass SMS / WhatsApp)'}
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-8 pt-2">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Nelson Mandela"
                  className="w-full p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-blue-500 dark:focus:border-blue-400 font-medium text-[15px] text-gray-900 dark:text-gray-100 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Mobile Number
                </label>
                <div className="flex border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-colors">
                  <div className="bg-gray-100 dark:bg-zinc-800/80 px-4 py-4 text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 border-r border-gray-200 dark:border-zinc-800 select-none">
                    <span>🇿🇦</span>
                    <span>+27</span>
                  </div>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="082 123 4567"
                    className="w-full p-4 bg-gray-50 dark:bg-zinc-900 outline-none font-medium text-[15px] text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* Delivery Channel Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Receive Passcode Via
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      channel === 'whatsapp'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-500'
                        : 'bg-gray-100 dark:bg-zinc-900 border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <MessageCircle size={16} className={channel === 'whatsapp' ? 'text-emerald-500' : ''} />
                    <span>WhatsApp (Fast)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('sms')}
                    className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      channel === 'sms'
                        ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500'
                        : 'bg-gray-100 dark:bg-zinc-900 border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Smartphone size={16} className={channel === 'sms' ? 'text-blue-500' : ''} />
                    <span>Cellular SMS</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full mt-4 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 ${
                  channel === 'whatsapp'
                    ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 shadow-lg shadow-emerald-600/25'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 shadow-lg shadow-blue-500/25'
                }`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Send Passcode via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                  6-Digit One-Time Passcode
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full p-4 tracking-[0.5em] text-center text-2xl font-bold bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-blue-500 dark:focus:border-blue-400 text-gray-900 dark:text-gray-100 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || otp.length < 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-95"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Verify & Continue'
                )}
              </button>

              <div className="space-y-2 pt-2 text-center text-xs font-semibold">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition"
                  >
                    Change Number
                  </button>

                  {countdown > 0 ? (
                    <span className="text-gray-400">Resend in {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp(undefined, channel)}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw size={12} />
                      Resend via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                    </button>
                  )}
                </div>

                {countdown === 0 && (
                  <div className="pt-1 border-t border-gray-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        const altChannel = channel === 'whatsapp' ? 'sms' : 'whatsapp'
                        setChannel(altChannel)
                        handleSendOtp(undefined, altChannel)
                      }}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                    >
                      Didn't receive it? Send via {channel === 'whatsapp' ? 'Cellular SMS instead' : 'WhatsApp instead'}
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-[11px] text-gray-400 dark:text-gray-500 leading-normal">
            By verifying, you agree to SOLO&apos;s Terms of Service and Privacy Policy. Zero platform commissions are baked into your rides.
          </p>
        </div>
      </div>
    </div>
  )
}
