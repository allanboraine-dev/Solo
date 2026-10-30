"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Mail,
  ShieldAlert,
  Phone,
  Car,
} from "lucide-react";

export interface DriverToReset {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  licensePlate?: string;
}

interface ResetDriverPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverToReset | null;
  onSuccess?: () => void;
}

function generateRandomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const specials = "@#$!";

  let pass = "Solo";
  // Add special
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  // Add year or 4 random digits
  for (let i = 0; i < 4; i++) {
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  // Add 2 uppercase & 2 lowercase
  pass += upper.charAt(Math.floor(Math.random() * upper.length));
  pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
}

export default function ResetDriverPasswordModal({
  isOpen,
  onClose,
  driver,
  onSuccess,
}: ResetDriverPasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendEmailLink, setSendEmailLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    password?: string;
    recoveryLink?: string | null;
    emailSent?: boolean;
    message?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && driver) {
      setNewPassword("");
      setShowPassword(false);
      setSendEmailLink(false);
      setError(null);
      setSuccessData(null);
      setCopiedField(null);
    }
  }, [isOpen, driver]);

  if (!isOpen || !driver) return null;

  const handleGeneratePassword = () => {
    const generated = generateRandomPassword();
    setNewPassword(generated);
    setShowPassword(true);
  };

  const handleCopy = (text: string, fieldName: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const handleCopyFullCredentials = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://solo.soloride.co.za";
    const loginUrl = `${origin}/driver/login`;
    const message = `SOLO Driver Account Details:\nDriver: ${driver.fullName}\nEmail: ${driver.email}\nNew Password: ${newPassword}\nLogin Portal: ${loginUrl}\n\nPlease sign in and change your password in settings if desired.`;
    handleCopy(message, "full_credentials");
  };

  const handleSubmit = async (e?: React.FormEvent, linkOnly: boolean = false) => {
    if (e) e.preventDefault();
    setError(null);

    const passwordToSend = linkOnly ? "" : newPassword.trim();

    if (!linkOnly && (!passwordToSend || passwordToSend.length < 6)) {
      setError("Please provide a password of at least 6 characters, or click 'Generate Password'.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/reset-driver-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: driver.id,
          email: driver.email,
          newPassword: passwordToSend || undefined,
          sendEmailLink: linkOnly || sendEmailLink,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update driver password");
      }

      setSuccessData({
        password: passwordToSend || undefined,
        recoveryLink: data.recoveryLink || null,
        emailSent: !!data.emailSent,
        message: data.message || "Password successfully updated.",
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "An unexpected error occurred while resetting password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 text-white space-y-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <KeyRound size={22} />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                Manager Clearance Action
              </span>
              <h3 className="text-lg sm:text-xl font-black text-white">
                Reset Driver Password
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Driver Snapshot Card */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="font-bold text-white text-sm truncate">
              {driver.fullName}
            </div>
            <div className="text-xs text-zinc-400 flex items-center gap-2 truncate">
              <Mail size={13} className="text-zinc-500 shrink-0" />
              <span className="truncate">{driver.email || "No email on record"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {driver.phone && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg text-zinc-300">
                <Phone size={11} className="text-zinc-500" />
                {driver.phone}
              </span>
            )}
            {driver.licensePlate && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg text-emerald-400">
                <Car size={11} className="text-zinc-500" />
                {driver.licensePlate}
              </span>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Success View */}
        {successData ? (
          <div className="space-y-4 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                <CheckCircle2 size={18} />
                <span>Password Reset Successfully!</span>
              </div>
              <p className="text-xs text-zinc-300">
                {successData.message} The driver can now sign in using their new credentials immediately.
              </p>
            </div>

            {successData.password && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold block">
                  New Password Assigned:
                </span>
                <div className="flex items-center justify-between gap-3 bg-zinc-900 px-3.5 py-2.5 rounded-xl border border-zinc-800">
                  <span className="font-mono text-sm font-bold text-white tracking-wide">
                    {successData.password}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(successData.password || "", "password")}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                    title="Copy Password"
                  >
                    {copiedField === "password" ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {successData.recoveryLink && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold block">
                  Direct Password Recovery Link:
                </span>
                <div className="flex items-center justify-between gap-3 bg-zinc-900 px-3.5 py-2 rounded-xl border border-zinc-800 text-xs">
                  <span className="font-mono text-zinc-300 truncate max-w-xs">
                    {successData.recoveryLink}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(successData.recoveryLink || "", "recoveryLink")}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition shrink-0"
                    title="Copy Link"
                  >
                    {copiedField === "recoveryLink" ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {successData.emailSent && (
              <div className="text-xs text-emerald-400 flex items-center gap-1.5 px-1">
                <Check size={14} />
                <span>Password reset link sent to driver&apos;s email ({driver.email})</span>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              {successData.password && (
                <button
                  type="button"
                  onClick={handleCopyFullCredentials}
                  className="w-full sm:flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98"
                >
                  {copiedField === "full_credentials" ? (
                    <>
                      <Check size={15} />
                      <span>Copied WhatsApp / SMS Message!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={15} />
                      <span>Copy Credentials for WhatsApp / SMS</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto py-3 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-2xl text-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  New Driver Password
                </label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                >
                  <Sparkles size={13} />
                  <span>Generate Password</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 6 characters)"
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 pr-12 font-mono"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-white p-1 rounded-lg transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Directly updates driver&apos;s password in Supabase Auth so they can log in instantly.
              </p>
            </div>

            {/* Also Send Reset Email Option */}
            {driver.email && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition">
                <input
                  type="checkbox"
                  checked={sendEmailLink}
                  onChange={(e) => setSendEmailLink(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5 rounded border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 bg-zinc-900 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-zinc-200 block">
                    Send password reset email to driver
                  </span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">
                    Dispatches a standard Supabase password recovery link to {driver.email}.
                  </span>
                </div>
              </label>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:flex-1 py-3 px-5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound size={16} />
                    <span>Set & Update Password</span>
                  </>
                )}
              </button>

              {driver.email && (
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, true)}
                  disabled={loading}
                  className="w-full sm:w-auto py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
                  title="Send reset link via email without setting password manually"
                >
                  <Send size={14} />
                  <span>Send Link Only</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
