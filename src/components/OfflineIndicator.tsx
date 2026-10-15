"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // Initial check
    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
    }

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOffline) {
    return (
      <aside
        aria-live="polite"
        role="status"
        className="fixed top-0 inset-x-0 z-50 bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-semibold py-2 px-4 shadow-lg text-center flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
      >
        <WifiOff size={14} className="animate-pulse" />
        <span>Working Offline — Cellular connectivity interrupted. Cached maps & active ride data remain available.</span>
      </aside>
    );
  }

  if (showRestored) {
    return (
      <aside
        aria-live="polite"
        role="status"
        className="fixed top-0 inset-x-0 z-50 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-semibold py-2 px-4 shadow-lg text-center flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
      >
        <Wifi size={14} />
        <span>Connection Restored — Live ride telemetry synchronized.</span>
      </aside>
    );
  }

  return null;
}
