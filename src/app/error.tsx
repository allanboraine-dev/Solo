"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, RotateCcw, ShieldAlert, UserPlus, Home, AlertCircle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isClearing, setIsClearing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("SOLO Client-side application exception:", error);
  }, [error]);

  const handleClearDataAndRepair = async () => {
    setIsClearing(true);
    try {
      // 1. Clear local storage and session storage to eliminate corrupted caches
      if (typeof window !== "undefined") {
        try {
          window.localStorage.clear();
        } catch {}
        try {
          window.sessionStorage.clear();
        } catch {}

        // 2. Unregister service workers that might be serving stale bundles
        if ("serviceWorker" in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.unregister();
            }
          } catch {}
        }

        // 3. Clear cache storage
        if ("caches" in window) {
          try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
            }
          } catch {}
        }

        // 4. Clean cookies
        try {
          document.cookie.split(";").forEach((cookie) => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
          });
        } catch {}
      }
    } finally {
      // Hard refresh to reload clean bundles
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-6 text-gray-900 dark:text-gray-100">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-200 dark:border-zinc-800 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert size={36} />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">
            Unable to Load Page on This Device
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            A device compatibility or cached storage exception occurred. Tap <strong>Quick Repair &amp; Reset</strong> below to clear cached data and reload cleanly.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleClearDataAndRepair}
            disabled={isClearing}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-95 transition-all text-sm disabled:opacity-50"
          >
            <RotateCcw size={16} className={isClearing ? "animate-spin" : ""} />
            <span>{isClearing ? "Clearing & Reloading..." : "Quick Repair & Reset (Recommended)"}</span>
          </button>

          <button
            type="button"
            onClick={() => reset()}
            className="w-full py-3 px-4 rounded-2xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-semibold flex items-center justify-center gap-2 transition text-xs"
          >
            <RefreshCw size={14} />
            <span>Try Again</span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link
              href="/driver/register"
              className="py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20 flex items-center justify-center gap-1.5 text-xs transition"
            >
              <UserPlus size={14} />
              <span>Register Online</span>
            </Link>
            <Link
              href="/"
              className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-bold flex items-center justify-center gap-1.5 text-xs transition"
            >
              <Home size={14} />
              <span>SOLO Home</span>
            </Link>
          </div>
        </div>

        {/* Technical Diagnostics */}
        <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 text-left">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 mx-auto font-medium"
          >
            <AlertCircle size={12} />
            <span>{showDetails ? "Hide technical diagnostic details" : "Show technical diagnostic details"}</span>
          </button>
          {showDetails && (
            <div className="mt-2 p-3 rounded-xl bg-gray-100 dark:bg-zinc-950 text-[10px] font-mono text-red-600 dark:text-red-400 break-words space-y-1">
              <div><strong>Message:</strong> {error.message || "Unknown client exception"}</div>
              {error.digest && <div><strong>Digest:</strong> {error.digest}</div>}
              {error.stack && (
                <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[9px] text-gray-500 pt-1">
                  {error.stack}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
