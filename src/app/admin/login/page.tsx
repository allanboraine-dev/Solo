"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, Key, ArrowRight, AlertCircle, CheckCircle2, ShieldAlert, Clock } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { isPlatformOwner, isOwnerPassword } from "@/utils/owner";
import { setAdminSession, clearAdminSession, verifyManagerPasscode, isOwnerPasscode, createOwnerAdminSession } from "@/utils/adminAuth";

const LOCKOUT_TIMESTAMP_KEY = "solo_admin_lockout_until";
const FAILED_ATTEMPTS_KEY = "solo_admin_failed_attempts";
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [securityPin, setSecurityPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Purge any existing manager session on mount so portal starts 100% clean
  useEffect(() => {
    if (typeof window === "undefined") return;
    clearAdminSession();
    setEmail("");
    setPassword("");
    setSecurityPin("");
  }, []);

  // Monitor and enforce persistent lockout across tab closes/refreshes
  useEffect(() => {
    const updateLockoutStatus = () => {
      if (typeof window === "undefined") return;
      const untilStr = localStorage.getItem(LOCKOUT_TIMESTAMP_KEY);
      if (!untilStr) {
        setIsLockedOut(false);
        setRemainingSeconds(null);
        return;
      }

      const until = Number(untilStr);
      const diffMs = until - Date.now();
      if (diffMs > 0) {
        setIsLockedOut(true);
        setRemainingSeconds(Math.ceil(diffMs / 1000));
      } else {
        // Lockout expired
        localStorage.removeItem(LOCKOUT_TIMESTAMP_KEY);
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        setIsLockedOut(false);
        setRemainingSeconds(null);
      }
    };

    updateLockoutStatus();
    const interval = setInterval(updateLockoutStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const recordFailedAttempt = () => {
    if (typeof window === "undefined") return;
    const current = Number(localStorage.getItem(FAILED_ATTEMPTS_KEY) || "0") + 1;
    localStorage.setItem(FAILED_ATTEMPTS_KEY, String(current));

    if (current >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(LOCKOUT_TIMESTAMP_KEY, String(lockUntil));
      setIsLockedOut(true);
      setRemainingSeconds(Math.ceil(LOCKOUT_DURATION_MS / 1000));
      setError(`Maximum security attempts exceeded. Portal locked for 30 minutes.`);
    } else {
      setError(`Access Denied: Invalid credentials or security PIN. ${MAX_ATTEMPTS - current} attempt(s) remaining.`);
    }
  };

  const handleExecutiveLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) {
      setError("Portal is locked. Unauthorized attempts are suspended.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPin = securityPin.trim();

    // 1. Validate Executive Master PIN
    if (!verifyManagerPasscode(cleanPin) && !isOwnerPasscode(cleanPin)) {
      recordFailedAttempt();
      setIsSubmitting(false);
      return;
    }

    // 2. Validate Platform Owner Clearance (Allan Boraine)
    if (isPlatformOwner(cleanEmail)) {
      if (isOwnerPassword(password) && isOwnerPasscode(cleanPin)) {
        // Reset failed attempts on successful authentication
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        localStorage.removeItem(LOCKOUT_TIMESTAMP_KEY);

        setSuccessMsg("Executive founder clearance verified. Opening Command Console...");
        setAdminSession(createOwnerAdminSession(cleanEmail));
        setTimeout(() => {
          router.push("/admin/compliance");
        }, 600);
        return;
      }
    }

    // 3. Fallback: Authenticate via Supabase for authorized operations managers
    try {
      const supabase = createClient();
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authErr || !data?.user) {
        recordFailedAttempt();
        setIsSubmitting(false);
        return;
      }

      // Reset failed attempts on success
      localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      localStorage.removeItem(LOCKOUT_TIMESTAMP_KEY);

      setSuccessMsg("Manager credentials verified. Opening Command Console...");
      setAdminSession({
        email: data.user.email || cleanEmail,
        name: data.user.user_metadata?.full_name || "Operations Manager",
        role: "compliance_manager",
        loginTime: new Date().toISOString(),
      });
      setTimeout(() => {
        router.push("/admin/compliance");
      }, 600);
    } catch (err: unknown) {
      recordFailedAttempt();
      setIsSubmitting(false);
    }
  };

  const formatRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-4 selection:bg-emerald-500 selection:text-black">
      {/* Background Ambient Security Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-red-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl shadow-black/80">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-4 text-emerald-400">
            <ShieldCheck size={36} />
          </div>
          <h1 className="text-2xl font-black tracking-tight flex items-center justify-center gap-2">
            <span>SOLO</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
              Manager Portal
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Restricted Management Console &amp; Verification Centre
          </p>
        </div>

        {/* Security Lockout Banner */}
        {isLockedOut && remainingSeconds !== null && (
          <div className="mb-6 p-4 bg-rose-950/70 border border-rose-700/80 rounded-2xl text-rose-200 text-xs space-y-2 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
              <ShieldAlert size={18} className="text-rose-400 shrink-0" />
              <span>SECURITY LOCKDOWN ACTIVE</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-300/90">
              Multiple unauthorized authentication attempts were recorded. Access to this management portal is temporarily suspended.
            </p>
            <div className="flex items-center gap-2 pt-2 border-t border-rose-800/60 font-mono text-xs text-white">
              <Clock size={14} className="text-rose-400" />
              <span>Time remaining: <strong>{formatRemaining(remainingSeconds)}</strong></span>
            </div>
          </div>
        )}

        {/* Feedback Alerts */}
        {error && !isLockedOut && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Single Hardened Executive Sign-In Form */}
        <form onSubmit={handleExecutiveLogin} autoComplete="off" className="space-y-4">
          {/* Decoy fields to intercept aggressive browser password auto-injectors */}
          <input type="text" name="fake_username_guard" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
          <input type="password" name="fake_password_guard" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Administrator Email
            </label>
            <input
              type="text"
              name="solo_admin_identity_field"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              required
              disabled={isLockedOut || isSubmitting}
              placeholder="admin@soloride.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Executive Password
            </label>
            <div className="relative">
              <input
                type="password"
                name="solo_admin_secret_token"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                required
                disabled={isLockedOut || isSubmitting}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
              />
              <Lock size={16} className="absolute right-3.5 top-3 text-zinc-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Master Security PIN
            </label>
            <div className="relative">
              <input
                type="password"
                name="solo_admin_master_pin"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                required
                disabled={isLockedOut || isSubmitting}
                placeholder="•••••"
                value={securityPin}
                onChange={(e) => setSecurityPin(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50 font-mono tracking-widest"
              />
              <Key size={16} className="absolute right-3.5 top-3 text-zinc-500" />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
              <Lock size={12} className="text-emerald-500 shrink-0" />
              <span>Multi-field clearance required. Maximum 3 attempts permitted.</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={isLockedOut || isSubmitting}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98 mt-2"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Verifying Security Clearance...</span>
              </div>
            ) : isLockedOut ? (
              <span>Locked ({remainingSeconds ? formatRemaining(remainingSeconds) : "Active"})</span>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Authorize Executive Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Quick Clear Action */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setEmail("");
                setPassword("");
                setSecurityPin("");
                setError(null);
                setSuccessMsg(null);
                clearAdminSession();
              }}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-4"
            >
              Clear Login Details
            </button>
            <span className="text-[10px] text-zinc-600 font-mono">Status: Ready</span>
          </div>
        </form>
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center text-[11px] text-zinc-500 space-y-1">
        <p>SOLO Commercial Ride-Hailing Platform &copy; {new Date().getFullYear()} Boraine Tech (Pty) Ltd</p>
        <p>Built and engineered by Boraine Tech (Pty) Ltd for authorized operations managers.</p>
      </div>
    </div>
  );
}

