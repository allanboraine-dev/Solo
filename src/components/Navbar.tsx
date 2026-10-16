"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const pathname = usePathname();

  const isRiderApp = pathname?.startsWith("/rider");
  const isDriverApp = pathname?.startsWith("/driver");

  return (
    <div className="fixed top-2.5 md:top-4 left-0 right-0 flex justify-center z-[1000] pointer-events-none px-3 md:px-4">
      <nav className="flex items-center justify-between px-4 md:px-6 py-2 md:py-3 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 rounded-full shadow-lg shadow-black/5 dark:shadow-black/20 w-full max-w-2xl pointer-events-auto transition-all">
        <div className="flex gap-4 md:gap-6 items-center">
          <Link href="/" className="font-extrabold text-lg md:text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            SOLO
          </Link>
          
          {!isDriverApp && (
            <Link href="/rider" className="text-xs md:text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Rider
            </Link>
          )}
          
          {!isRiderApp && (
            <Link href="/driver" className="text-xs md:text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition-colors">
              Driver
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
