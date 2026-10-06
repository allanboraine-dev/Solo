"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePWA } from "@/lib/PWAContext";
import { Download } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { isStandalone, installApp } = usePWA();

  const isRiderApp = pathname?.startsWith("/rider");
  const isDriverApp = pathname?.startsWith("/driver");

  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-[9999] pointer-events-none px-4">
      <nav className="flex items-center justify-between px-6 py-3 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-gray-200/50 dark:border-white/10 rounded-full shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-2xl pointer-events-auto transition-all">
        <div className="flex gap-6 items-center">
          <Link href="/" className="font-extrabold text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            SOLO
          </Link>
          
          {!isDriverApp && (
            <Link href="/rider" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Rider
            </Link>
          )}
          
          {!isRiderApp && (
            <Link href="/driver" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors">
              Driver
            </Link>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!isStandalone && (
            <button 
              onClick={installApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-full hover:scale-105 active:scale-95 transition-all shadow-md"
            >
              <Download size={14} />
              Install
            </button>
          )}
          <div className="relative pl-4 border-l border-gray-300/50 dark:border-gray-700/50">
             <ThemeToggle />
          </div>
        </div>
      </nav>
    </div>
  );
}
