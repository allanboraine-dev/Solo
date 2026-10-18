"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const pathname = usePathname();

  const isRiderApp = pathname?.startsWith("/rider");
  const isDriverApp = pathname?.startsWith("/driver");

  return (
    <div className="fixed top-2.5 md:top-4 pt-safe left-0 right-0 flex justify-center z-[1000] pointer-events-none px-3 md:px-4">
      <nav className="flex items-center justify-between px-4 md:px-6 py-2 md:py-3 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 rounded-full shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-2xl pointer-events-auto transition-all">
        <div className="flex gap-4 md:gap-6 items-center">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-lg md:text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600">
            <img
              src="/icon-192.png"
              alt="SOLO Logo"
              className="w-7 h-7 md:w-8 md:h-8 rounded-lg shadow-sm object-cover border border-emerald-500/30"
            />
            <span>SOLO</span>
          </Link>
          
          {!isDriverApp && (
            <Link
              href="/rider"
              className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 border border-blue-500/20 px-2.5 py-1 rounded-full transition-all"
            >
              <img
                src="/rider-icon-192.png"
                alt="Rider Portal"
                className="w-5 h-5 rounded-md object-cover border border-blue-400/40 shadow-2xs"
              />
              <span>Rider</span>
            </Link>
          )}
          
          {!isRiderApp && (
            <Link
              href="/driver"
              className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1 rounded-full transition-all"
            >
              <img
                src="/driver-icon-192.png"
                alt="Driver Portal"
                className="w-5 h-5 rounded-md object-cover border border-emerald-400/40 shadow-2xs"
              />
              <span>Driver</span>
            </Link>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative pl-1 md:pl-2">
             <ThemeToggle />
          </div>
        </div>
      </nav>
    </div>
  );
}
