"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ShieldCheck, MapPin, Car, CheckCircle2, ChevronRight, Zap, CreditCard, Navigation } from 'lucide-react'

export interface AppIntroSplashProps {
  role: 'rider' | 'driver'
  /** Optional callback fired when intro finishes or is skipped */
  onFinish?: () => void
  /** Total display duration in milliseconds before auto-dismissing (default: 2600ms) */
  durationMs?: number
  /** Skip animation if user has already seen it during this tab session (default: true) */
  sessionOnce?: boolean
  /** Force bypass (e.g. if active trip is currently in progress) */
  bypass?: boolean
}

export default function AppIntroSplash({
  role,
  onFinish,
  durationMs = 2600,
  sessionOnce = true,
  bypass = false,
}: AppIntroSplashProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    // If bypassed (e.g. user is in an active trip), do not display
    if (bypass) {
      setIsVisible(false)
      return
    }

    // Check if session storage already has this marked
    if (typeof window !== 'undefined' && sessionOnce) {
      try {
        const seenKey = `solo_${role}_intro_seen`
        if (sessionStorage.getItem(seenKey) === 'true') {
          setIsVisible(false)
          return
        }
      } catch {
        // Fallback for private browsing mode without storage access
      }
    }

    setIsVisible(true)

    // Trigger subtle native haptic vibration if supported on mobile
    if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([25, 40, 25])
      } catch {
        // Silently ignore if blocked
      }
    }

    // Attempt subtle audio chime (optional, non-blocking)
    if (typeof window !== 'undefined') {
      try {
        const audio = new Audio('/dispatch-chime.wav')
        audio.volume = 0.15
        audio.play().catch(() => {
          // Autoplay policy prevented playback; ignore gracefully
        })
      } catch {
        // Ignore audio errors
      }
    }

    // Progress bar animation loop
    startTimeRef.current = performance.now()
    const updateProgress = (now: number) => {
      const elapsed = now - startTimeRef.current
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100))
      setProgress(pct)

      if (elapsed < durationMs) {
        animFrameRef.current = requestAnimationFrame(updateProgress)
      } else {
        handleDismiss()
      }
    }

    animFrameRef.current = requestAnimationFrame(updateProgress)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [bypass, role, durationMs, sessionOnce])

  const handleDismiss = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)

    // Mark as seen in this session
    if (typeof window !== 'undefined' && sessionOnce) {
      try {
        sessionStorage.setItem(`solo_${role}_intro_seen`, 'true')
      } catch {}
    }

    setIsVisible(false)
    if (onFinish) {
      onFinish()
    }
  }

  const isRider = role === 'rider'

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={`solo-intro-${role}`}
          initial={{ opacity: 1 }}
          exit={{ 
            opacity: 0, 
            scale: 1.04, 
            filter: 'blur(8px)',
            transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } 
          }}
          onClick={handleDismiss}
          className="fixed inset-0 z-[99999] flex flex-col justify-between items-center select-none overflow-hidden touch-manipulation cursor-pointer"
          style={{
            background: isRider
              ? 'radial-gradient(circle at 50% 30%, #0f172a 0%, #030712 100%)'
              : 'radial-gradient(circle at 50% 30%, #064e3b 0%, #022c22 45%, #050b09 100%)',
          }}
        >
          {/* Ambient Glowing Orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.25, 0.45, 0.25],
                x: [-10, 10, -10],
                y: [-10, 10, -10],
              }}
              transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
              className={`absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-[110px] ${
                isRider ? 'bg-blue-600/30' : 'bg-emerald-500/30'
              }`}
            />
            <motion.div
              animate={{
                scale: [1.1, 0.95, 1.1],
                opacity: [0.2, 0.35, 0.2],
              }}
              transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
              className={`absolute -bottom-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-[100px] ${
                isRider ? 'bg-cyan-500/25' : 'bg-teal-400/20'
              }`}
            />
            {/* Subtle Tech Grid overlay */}
            <div
              className="absolute inset-0 opacity-[0.035] pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
                backgroundSize: '36px 36px',
                color: isRider ? '#60a5fa' : '#34d399',
              }}
            />
          </div>

          {/* Top Bar: Live Branding & Skip Action */}
          <header className="w-full max-w-md px-6 pt-safe pt-5 flex items-center justify-between z-10 pointer-events-none">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-ping ${isRider ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
              <span className="text-[11px] font-black uppercase tracking-widest text-white/70">
                {isRider ? 'SOLO RIDER NETWORK' : 'SOLO CAPTAIN PORTAL'}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDismiss()
              }}
              className="pointer-events-auto px-3 py-1 rounded-full text-xs font-bold text-white/80 bg-white/10 hover:bg-white/20 active:scale-95 transition-all border border-white/15 backdrop-blur-md flex items-center gap-1 shadow-sm"
            >
              <span>Skip</span>
              <ChevronRight size={13} className="text-white/60" />
            </button>
          </header>

          {/* Central Hero Showcase */}
          <main className="w-full max-w-sm px-6 flex flex-col items-center text-center z-10 my-auto">
            {/* Logo Squircle with Neon Pulse & Radar Ripples */}
            <div className="relative mb-6 flex items-center justify-center">
              {/* Radar waves */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeOut' }}
                className={`absolute w-28 h-28 rounded-[2.5rem] border ${
                  isRider ? 'border-blue-400/40 bg-blue-500/10' : 'border-emerald-400/40 bg-emerald-500/10'
                }`}
              />
              <motion.div
                initial={{ scale: 0.8, opacity: 0.8 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2.2, delay: 0.7, ease: 'easeOut' }}
                className={`absolute w-28 h-28 rounded-[2.2rem] border ${
                  isRider ? 'border-cyan-400/30 bg-cyan-500/10' : 'border-teal-400/30 bg-teal-500/10'
                }`}
              />

              {/* Central Glowing Icon Box */}
              <motion.div
                initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 220 }}
                className={`relative p-2 rounded-[2rem] shadow-2xl backdrop-blur-xl border ${
                  isRider
                    ? 'bg-gradient-to-br from-blue-600/60 via-indigo-600/40 to-slate-900/80 border-blue-400/40 shadow-blue-500/30'
                    : 'bg-gradient-to-br from-emerald-600/60 via-teal-700/40 to-zinc-950/80 border-emerald-400/40 shadow-emerald-500/30'
                }`}
              >
                <img
                  src={isRider ? '/rider-icon-192.png' : '/driver-icon-192.png'}
                  alt="SOLO"
                  width={84}
                  height={84}
                  className="w-20 h-20 sm:w-22 sm:h-22 rounded-[1.6rem] object-cover shadow-inner border border-white/20"
                  onError={(e) => {
                    // Fallback to solo-logo.png or icon-192.png if role icon isn't loaded
                    const target = e.target as HTMLImageElement
                    target.src = '/icon-192.png'
                  }}
                />

                {/* Floating micro-badge on icon */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: 'spring', damping: 12 }}
                  className={`absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-lg border border-white/30 flex items-center gap-1 ${
                    isRider ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-emerald-500 to-green-600'
                  }`}
                >
                  {isRider ? <Sparkles size={11} /> : <ShieldCheck size={11} />}
                  <span>{isRider ? 'Rider' : 'Driver'}</span>
                </motion.div>
              </motion.div>
            </div>

            {/* Brand Title & Welcome Greeting */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-1.5"
            >
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>SOLO</span>
                <span
                  className={`text-transparent bg-clip-text ${
                    isRider
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-400'
                      : 'bg-gradient-to-r from-emerald-400 to-teal-300'
                  }`}
                >
                  {isRider ? 'Go' : 'Drive'}
                </span>
              </h1>

              <p className="text-xs sm:text-sm font-semibold text-slate-300 max-w-[280px] mx-auto leading-relaxed">
                {isRider
                  ? 'South Africa’s Zero-Commission E-Hailing. Fast, safe & direct.'
                  : 'Zero Commission • Keep 100% of your fares • Paid directly to you.'}
              </p>
            </motion.div>

            {/* Dynamic Value Propositions / Animated Pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="w-full mt-6 space-y-2 text-left"
            >
              {isRider ? (
                <>
                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <Sparkles size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">100% Free For Riders</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Zero markup on base distance fares</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                      <CreditCard size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">Direct In-Car Speedpoint or Cash</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Tap card, phone, or pay cash to driver</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <ShieldCheck size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">Verified SA Drivers & SOS Shield</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Live GPS tracking & emergency dispatch</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Zap size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">0% Platform Deduction</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Earn R100, keep R100 instantly</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                      <Navigation size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">Smart City Radar & Telemetry</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Instant ride broadcast to your vehicle</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                    <div className="w-7 h-7 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center shrink-0">
                      <ShieldCheck size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">Driver Protection & Support</p>
                      <p className="text-[10px] text-slate-400 leading-tight">2-min grace waiting fees & direct SOS</p>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </main>

          {/* Bottom Progress & Tap Notice */}
          <footer className="w-full max-w-sm px-6 pb-safe pb-6 flex flex-col items-center gap-3 z-10 pointer-events-none">
            {/* Elegant Slim Loading Bar */}
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden backdrop-blur-md border border-white/10">
              <motion.div
                className={`h-full rounded-full ${
                  isRider
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-300'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-[11px] font-medium text-white/50 tracking-wide animate-pulse">
              Initializing application... tap anywhere to start
            </p>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
