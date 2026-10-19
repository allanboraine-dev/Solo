"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, Key, ArrowRight, AlertCircle, CheckCircle2, UserCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { isPlatformOwner, isOwnerPassword } from "@/utils/owner";
import { setAdminSession, verifyManagerPasscode, isOwnerPasscode, createOwnerAdminSession } from "@/utils/adminAuth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"passkey" | "email">("passkey");
  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Manager / Owner Passkey Login
  const handlePasskeyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) {
      setError("Maximum login attempts exceeded. Access locked for security.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    if (isOwnerPasscode(passcode)) {
      setSuccessMsg("Master founder credentials verified. Access granted.");
      setAdminSession(createOwnerAdminSession("allanboraine@gmail.com"));
      setTimeout(() => {
        router.push("/admin/compliance");
      }, 500);
      return;
    }

    if (verifyManagerPasscode(passcode)) {
      setSuccessMsg("Manager credentials verified. Access granted.");
      setAdminSession({
        email: "operations@soloride.co.za",
        name: "SOLO Compliance Manager",
        role: "compliance_manager",
        loginTime: new Date().toISOString(),
      });
      setTimeout(() => {
        router.push("/admin/compliance");
      }, 500);
    } else {
      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);
      if (nextCount >= 5) {
        setIsLockedOut(true);
        setError("Maximum login attempts exceeded. Portal temporarily locked for security.");
      } else {
        setError(`Invalid Security Passkey. ${5 - nextCount} attempt(s) remaining.`);
      }
      setIsSubmitting(false);
    }
  };

  // Admin Email & Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) {
      setError("Maximum login attempts exceeded. Access locked for security.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();

    // Check if platform owner is logging in
    if (isPlatformOwner(cleanEmail)) {
      if (isOwnerPassword(password)) {
        setSuccessMsg("Platform founder clearance verified. Access granted.");
        setAdminSession(createOwnerAdminSession(cleanEmail));
        setTimeout(() => {
          router.push("/admin/compliance");
        }, 500);
        return;
      }

      // Try Supabase auth if customized
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!authError && data?.user) {
          setSuccessMsg("Platform founder clearance verified. Access granted.");
          setAdminSession(createOwnerAdminSession(cleanEmail));
          setTimeout(() => {
            router.push("/admin/compliance");
          }, 500);
          return;
        }
      } catch (err) {
        console.warn("Auth check notice:", err);
      }

      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);
      if (nextCount >= 5) {
        setIsLockedOut(true);
        setError("Maximum login attempts exceeded. Portal temporarily locked for security.");
      } else {
        setError(`Invalid credentials. ${5 - nextCount} attempt(s) remaining.`);
      }
      setIsSubmitting(false);
      return;
    }

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authErr) {
        const nextCount = failedAttempts + 1;
        setFailedAttempts(nextCount);
        if (nextCount >= 5) {
          setIsLockedOut(true);
          setError("Maximum login attempts exceeded. Portal temporarily locked for security.");
        } else {
          setError(`Invalid credentials. ${5 - nextCount} attempt(s) remaining.`);
        }
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg("Authentication successful. Opening Manager Console...");
      setAdminSession({
        email: data.user?.email || cleanEmail,
        name: data.user?.user_metadata?.full_name || "Compliance Officer",
        role: "operations_officer",
        loginTime: new Date().toISOString(),
      });
      setTimeout(() => {
        router.push("/admin/compliance");
      }, 500);
    } catch (err: unknown) {
      setError((err as Error).message || "An unexpected authentication error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-4 selection:bg-emerald-500 selection:text-black">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
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
            System Administrator & Driver Verification Console
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950/70 border border-zinc-800/80 rounded-xl mb-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab("passkey");
              setError(null);
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === "passkey"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Key size={14} />
            <span>Manager Passkey</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("email");
              setError(null);
            }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === "email"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Lock size={14} />
            <span>Admin Account</span>
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
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

        {/* Passkey Form */}
        {activeTab === "passkey" && (
          <form onSubmit={handlePasskeyLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Manager Security Passkey or Master PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  disabled={isLockedOut || isSubmitting}
                  placeholder="Enter Security Passkey or Master PIN"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
                />
                <Key size={16} className="absolute right-3.5 top-3.5 text-zinc-500" />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
                <Lock size={12} className="text-emerald-500 shrink-0" />
                <span>Restricted internal portal. Unauthorized access attempts are monitored and logged.</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={isLockedOut || isSubmitting}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98"
            >
              <span>{isSubmitting ? "Authenticating..." : isLockedOut ? "Access Locked" : "Unlock Manager Console"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* Email & Password Form */}
        {activeTab === "email" && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Administrator Email
              </label>
              <input
                type="email"
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
                Admin Password
              </label>
              <input
                type="password"
                required
                disabled={isLockedOut || isSubmitting}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLockedOut || isSubmitting}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98"
            >
              <span>{isSubmitting ? "Verifying..." : isLockedOut ? "Access Locked" : "Sign In to Admin Portal"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center text-[11px] text-zinc-500 space-y-1">
        <p>SOLO Commercial Ride-Hailing Platform &copy; {new Date().getFullYear()}</p>
        <p>Strictly for authorized operations managers and compliance reviewers.</p>
      </div>
    </div>
  );
}
