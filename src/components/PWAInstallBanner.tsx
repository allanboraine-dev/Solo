"use client";

import { usePWA } from "@/lib/PWAContext";
import { Download, X, Share, PlusSquare, Check } from "lucide-react";
import Image from "next/image";

interface PWAInstallBannerProps {
  appName?: string;
  role?: "rider" | "driver";
}

export function PWAInstallBanner({ appName = "SOLO", role = "rider" }: PWAInstallBannerProps) {
  const {
    isStandalone,
    isInstalled,
    isPwaReady,
    showIosGuide,
    setShowIosGuide,
    installApp,
    dismissBanner,
    isBannerDismissed,
  } = usePWA();

  // If already running in standalone mode or already installed, never show the banner
  if (!isPwaReady || isStandalone || isInstalled) return null;

  const isDriver = role === "driver";
  const iconSrc = isDriver ? "/driver-icon-192.png" : "/rider-icon-192.png";
  const accentColorClass = isDriver
    ? "from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white"
    : "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white";

  return (
    <>
      {/* Floating Mobile Install Bar (only if not dismissed) */}
      {!isBannerDismissed && (
        <aside
          aria-label="Install App Banner"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-40 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white p-4 rounded-2xl shadow-2xl shadow-black/50 animate-in slide-in-from-bottom duration-500 flex items-center gap-3.5"
        >
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-zinc-700 bg-black">
            <Image
              src={iconSrc}
              alt={appName}
              width={48}
              height={48}
              className="object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold truncate">Install {appName}</h4>
            <p className="text-xs text-zinc-400 line-clamp-1">
              Add to Home Screen for instant trip alerts & offline maps
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => installApp(role)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl shadow-md bg-gradient-to-r ${accentColorClass} active:scale-95 transition flex items-center gap-1.5`}
            >
              <Download size={14} />
              <span>Install</span>
            </button>
            <button
              onClick={dismissBanner}
              aria-label="Dismiss banner"
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
            >
              <X size={16} />
            </button>
          </div>
        </aside>
      )}

      {/* iOS Safari Guided Install Sheet */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white space-y-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIosGuide(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2 rounded-full hover:bg-zinc-800 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl overflow-hidden border border-zinc-700 bg-black mb-2 shadow-lg">
                <Image
                  src={iconSrc}
                  alt={appName}
                  width={56}
                  height={56}
                  className="object-cover"
                />
              </div>
              <h3 className="text-lg font-bold">Install {appName} on iOS</h3>
              <p className="text-xs text-zinc-400">
                Install as a standalone web app on your iPhone or iPad in 3 simple steps:
              </p>
            </div>

            <div className="space-y-4 text-sm bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex-1 text-xs leading-relaxed text-zinc-300">
                  Tap the <span className="font-semibold text-white inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700"><Share size={12} className="text-blue-400" /> Share</span> button at the bottom of Safari.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex-1 text-xs leading-relaxed text-zinc-300">
                  Scroll down the menu and tap <span className="font-semibold text-white inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700"><PlusSquare size={12} className="text-emerald-400" /> Add to Home Screen</span>.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div className="flex-1 text-xs leading-relaxed text-zinc-300">
                  Tap <span className="font-semibold text-white inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700"><Check size={12} className="text-blue-400" /> Add</span> in the top-right corner.
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
