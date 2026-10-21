"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    console.error("SOLO Root application exception:", error);
  }, [error]);

  const handleClearDataAndRepair = async () => {
    setIsClearing(true);
    try {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.clear();
        } catch {}
        try {
          window.sessionStorage.clear();
        } catch {}

        if ("serviceWorker" in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.unregister();
            }
          } catch {}
        }

        if ("caches" in window) {
          try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
            }
          } catch {}
        }

        try {
          document.cookie.split(";").forEach((cookie) => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
          });
        } catch {}
      }
    } finally {
      window.location.href = "/driver/register";
    }
  };

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans antialiased">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold">
            ⚠️
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl sm:text-2xl font-black">SOLO System Recovery</h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              An initialization exception occurred on this device. Tap the repair button below to clean your local cache and open Driver Registration.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={handleClearDataAndRepair}
              disabled={isClearing}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition"
            >
              {isClearing ? "Clearing & Resetting..." : "Repair & Open Driver Registration"}
            </button>

            <button
              type="button"
              onClick={() => reset()}
              className="w-full py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition"
            >
              Try Again
            </button>
          </div>

          <div className="text-[10px] text-zinc-500 border-t border-zinc-800/80 pt-3">
            SOLO E-Hailing Platform • Zero Commission • Boraine Tech (Pty) Ltd
          </div>
        </div>
      </body>
    </html>
  );
}
