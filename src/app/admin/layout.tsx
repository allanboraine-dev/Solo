"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  FileCheck2,
  Users,
  Cpu,
  LogOut,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { getAdminSession, clearAdminSession, AdminSession } from "@/utils/adminAuth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setIsReady(true);
      return;
    }

    const currentSession = getAdminSession();
    if (!currentSession) {
      router.push("/admin/login");
    } else {
      setSession(currentSession);
      setIsReady(true);
    }
  }, [pathname, isLoginPage, router]);

  const handleSignOut = () => {
    clearAdminSession();
    router.push("/admin/login");
  };

  // If on the login page, render children directly without admin chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Prevent flash of protected content while validating session
  if (!isReady) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono">Validating Manager Clearance...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col selection:bg-emerald-500 selection:text-black">
      {/* Top Manager Command Navigation */}
      <header className="sticky top-0 z-40 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand Logo & Portal Tag */}
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="flex items-center gap-2.5 group transition"
              >
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 group-hover:bg-emerald-500/20 transition">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base tracking-tight text-white">
                      SOLO
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Manager Portal
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 hidden sm:block">
                    Verification & Compliance Command
                  </p>
                </div>
              </Link>

              {/* Navigation Tabs */}
              <nav className="hidden md:flex items-center gap-1 ml-6 pl-6 border-l border-zinc-800">
                <Link
                  href="/admin/compliance"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    pathname === "/admin/compliance"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  <FileCheck2 size={15} />
                  <span>Driver Verification</span>
                </Link>

                <Link
                  href="/admin"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    pathname === "/admin"
                      ? "bg-zinc-800 text-white border border-zinc-700"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  <Users size={15} />
                  <span>Overview & Directory</span>
                </Link>

                <Link
                  href="/admin/simulator"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    pathname === "/admin/simulator"
                      ? "bg-zinc-800 text-white border border-zinc-700"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  <Cpu size={15} />
                  <span>Trip Simulator</span>
                </Link>
              </nav>
            </div>

            {/* Right: Active Manager & Sign Out */}
            <div className="flex items-center gap-3">
              {session && (
                <div className="hidden sm:flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 px-3 py-1.5 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                  <div className="text-left text-xs">
                    <span className="font-semibold text-zinc-200 block leading-tight">
                      {session.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {session.isOwner ? "Platform Founder" : "Operations Manager"}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSignOut}
                className="py-1.5 px-3 bg-zinc-800/80 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-700/50 text-zinc-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-zinc-700/60 transition"
                title="Sign out of Manager Console"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Strip */}
        <div className="md:hidden flex items-center justify-around px-2 py-2 border-t border-zinc-800/80 bg-zinc-950/80 text-xs font-bold">
          <Link
            href="/admin/compliance"
            className={`py-1.5 px-3 rounded-lg flex items-center gap-1 ${
              pathname === "/admin/compliance"
                ? "bg-emerald-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <FileCheck2 size={13} />
            <span>Verification</span>
          </Link>
          <Link
            href="/admin"
            className={`py-1.5 px-3 rounded-lg flex items-center gap-1 ${
              pathname === "/admin"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Users size={13} />
            <span>Overview</span>
          </Link>
          <Link
            href="/admin/simulator"
            className={`py-1.5 px-3 rounded-lg flex items-center gap-1 ${
              pathname === "/admin/simulator"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Cpu size={13} />
            <span>Simulator</span>
          </Link>
        </div>
      </header>

      {/* Main Protected Content Area */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
