"use client";

import { useEffect, useState } from "react";
import { WifiOff, RotateCw, PhoneCall, ShieldAlert, Car, MapPin } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.reload();
      } else {
        setIsRetrying(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-6 relative z-10">
        {/* Animated Offline Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/5">
          <WifiOff size={40} className="animate-pulse" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">You are currently offline</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            No internet connection detected. This can happen in underground parking, mobile network dead zones, or during localized power outages.
          </p>
        </div>

        {/* Retry Button */}
        <div className="pt-2">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
          >
            <RotateCw size={18} className={isRetrying ? "animate-spin" : ""} />
            {isRetrying ? "Checking Network..." : "Check Connection & Reload"}
          </button>
          {isOnline && (
            <p className="text-emerald-400 text-xs font-semibold mt-2 animate-bounce">
              ✓ Connection detected! Tap reload above to continue.
            </p>
          )}
        </div>

        {/* In-Transit Safety Notice */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-left space-y-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold">
            <ShieldAlert size={16} className="text-blue-400" />
            <span>Active Trip Safety Protocol</span>
          </div>
          <p className="text-zinc-400 leading-normal">
            If you are currently on a trip, your agreed destination, driver vehicle details, and trip PIN remain unchanged. Fare settlement and GPS telemetry will automatically sync when cellular signal resumes.
          </p>
        </div>

        {/* Quick Emergency Contacts */}
        <div className="space-y-2 text-left pt-2">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold px-1">
            South Africa Emergency Hotlines
          </p>
          <div className="grid grid-cols-3 gap-2">
            <a
              href="tel:10111"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition text-center"
            >
              <PhoneCall size={16} className="text-red-400 mb-1" />
              <span className="text-sm font-bold">10111</span>
              <span className="text-[10px] text-zinc-500">Police</span>
            </a>
            <a
              href="tel:10177"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition text-center"
            >
              <PhoneCall size={16} className="text-amber-400 mb-1" />
              <span className="text-sm font-bold">10177</span>
              <span className="text-[10px] text-zinc-500">Ambulance</span>
            </a>
            <a
              href="tel:112"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition text-center"
            >
              <PhoneCall size={16} className="text-emerald-400 mb-1" />
              <span className="text-sm font-bold">112</span>
              <span className="text-[10px] text-zinc-500">Mobile SOS</span>
            </a>
          </div>
        </div>

        {/* Return Links */}
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 pt-4">
          <Link href="/rider" className="hover:text-blue-400 flex items-center gap-1 transition">
            <MapPin size={12} /> Rider Portal
          </Link>
          <span>•</span>
          <Link href="/driver" className="hover:text-green-400 flex items-center gap-1 transition">
            <Car size={12} /> Driver Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
