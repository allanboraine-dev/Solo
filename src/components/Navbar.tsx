"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePWA } from "@/lib/PWAContext";

export function Navbar() {
  const pathname = usePathname();
  const { isStandalone, installedRole, installApp } = usePWA();

  const isRiderApp = pathname?.startsWith("/rider");
  const isDriverApp = pathname?.startsWith("/driver");
  const isFleetApp = pathname?.startsWith("/fleet");

  // In standalone / installed PWA mode, tapping the brand logo stays inside the installed portal
  const brandHref = isStandalone
    ? isDriverApp || installedRole === "driver"
      ? "/driver"
      : isRiderApp || installedRole === "rider"
      ? "/rider"
      : "/"
    : "/";

  return (
    <div className="fixed top-2 sm:top-2.5 md:top-3 pt-safe left-0 right-0 flex justify-center z-[1000] pointer-events-none px-2 sm:px-4 md:px-6">
      <nav className="flex items-center justify-between px-3 sm:px-5 md:px-6 py-2 md:py-2.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-gray-200/80 dark:border-white/15 rounded-full shadow-lg shadow-black/5 dark:shadow-black/25 w-full max-w-xl md:max-w-2xl lg:max-w-3xl pointer-events-auto transition-all">
        <div className="flex gap-1.5 sm:gap-3.5 md:gap-4 items-center min-w-0">
          <Link
            href={brandHref}
            className="flex items-center gap-1.5 sm:gap-2 font-extrabold text-base sm:text-xl md:text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 shrink-0 py-1"
          >
            <img
              src={isDriverApp ? "/driver-icon-192.png" : isRiderApp ? "/rider-icon-192.png" : "/icon-192.png"}
              alt="SOLO Logo"
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl shadow-sm object-cover border border-emerald-500/30"
            />
            <span>SOLO</span>
          </Link>

          {!isDriverApp && !isStandalone && (
            <Link
              href="/rider"
              className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base font-bold px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[38px] sm:min-h-[40px] rounded-full border transition-all active:scale-95 ${
                isRiderApp
                  ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                  : "text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/25"
              }`}
            >
              <img
                src="/rider-icon-192.png"
                alt="Rider Portal"
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-md object-cover border border-blue-400/40 shadow-2xs"
              />
              <span>Rider</span>
            </Link>
          )}

          {!isRiderApp && !isStandalone && (
            <Link
              href="/driver"
              className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base font-bold px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[38px] sm:min-h-[40px] rounded-full border transition-all active:scale-95 ${
                isDriverApp
                  ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                  : "text-gray-800 dark:text-gray-100 hover:text-emerald-600 dark:hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25"
              }`}
            >
              <img
                src="/driver-icon-192.png"
                alt="Driver Portal"
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-md object-cover border border-emerald-400/40 shadow-2xs"
              />
              <span>Driver</span>
            </Link>
          )}

          {!isDriverApp && !isRiderApp && !isStandalone && (
            <Link
              href="/fleet"
              className={`hidden sm:flex items-center gap-1.5 text-sm md:text-base font-bold px-3.5 sm:px-4 py-2 min-h-[40px] rounded-full border transition-all active:scale-95 ${
                isFleetApp
                  ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                  : "text-gray-800 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/25"
              }`}
            >
              <span>Fleet</span>
            </Link>
          )}

          {isStandalone && (isDriverApp || isRiderApp) && (
            <span
              className={`inline-flex items-center gap-2 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full border ${
                isDriverApp
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isDriverApp ? "bg-emerald-500" : "bg-blue-500"
                }`}
              />
              <span>{isDriverApp ? "Driver Portal" : "Rider App"}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isStandalone && (
            <button
              type="button"
              onClick={() =>
                installApp(
                  isDriverApp
                    ? "driver"
                    : isRiderApp
                    ? "rider"
                    : installedRole || "rider"
                )
              }
              className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 min-h-[38px] sm:min-h-[40px] rounded-full text-xs sm:text-sm font-bold border transition-all active:scale-95 ${
                isDriverApp
                  ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/35"
                  : "bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-500/35"
              }`}
              title={isDriverApp ? "Install SOLO Driver App" : "Install SOLO App"}
            >
              <Download size={15} className="shrink-0" />
              <span className="hidden sm:inline">
                Install {isDriverApp ? "Driver" : isRiderApp ? "Rider" : ""} App
              </span>
              <span className="sm:hidden">Install</span>
            </button>
          )}
          <div className="relative pl-0.5 sm:pl-1">
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </div>
  );
}
