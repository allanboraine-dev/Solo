"use client"

import Link from "next/link";
import { Car, Map, ShieldCheck, Download, UserPlus, Building2, ArrowUpRight, Sparkles, CheckCircle2 } from "lucide-react";
import { usePWA } from "@/lib/PWAContext";

export default function Home() {
  const { installApp, isStandalone } = usePWA();

  const handleDriverInstall = () => {
    installApp('driver');
  };

  return (
    <div className="min-h-mobile-portal bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden pt-6 sm:pt-10 md:pt-12 pb-16 sm:pb-20 md:pb-24">
      {/* Modern Gradient Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-[100px] pointer-events-none z-0"></div>
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none z-0" 
           style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <main className="max-w-6xl w-full text-center space-y-12 sm:space-y-16 lg:space-y-20 px-4 sm:px-6 md:px-8 py-4 relative z-10">
        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="flex justify-center mb-4 sm:mb-6">
            <div className="relative p-1.5 rounded-[2rem] bg-gradient-to-br from-emerald-500/40 via-teal-500/20 to-blue-600/40 shadow-2xl shadow-emerald-500/20">
              <img
                src="/icon-512.png"
                alt="SOLO Official App Icon"
                className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-[1.7rem] object-cover shadow-inner border border-white/15"
              />
            </div>
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-6xl lg:text-7xl xl:text-8xl font-extrabold tracking-tighter leading-tight">
            Move Freely <br className="hidden sm:block"/> with <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">SOLO</span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-gray-700 dark:text-gray-300 max-w-2xl mx-auto font-medium px-2">
            The Zero-Commission E-Hailing Platform built for South Africa.
          </p>
          
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 pt-2 sm:pt-4 text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-5 py-2.5 rounded-full border border-blue-200/80 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 shadow-sm">
              <Sparkles size={18} className="text-blue-500 shrink-0"/> Rider App 100% Free
            </div>
            <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-5 py-2.5 rounded-full border border-gray-200/80 dark:border-white/10 shadow-sm">
              <ShieldCheck size={18} className="text-green-500 shrink-0"/> Verified Drivers
            </div>
            <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-5 py-2.5 rounded-full border border-gray-200/80 dark:border-white/10 shadow-sm">
              <Map size={18} className="text-blue-500 shrink-0"/> Real-time Tracking
            </div>
            <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-5 py-2.5 rounded-full border border-emerald-200/80 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 shadow-sm">
              <Car size={18} className="text-emerald-500 shrink-0"/> Drivers: 14 Days Free, then R499/pm
            </div>
          </div>

          {/* Pricing distinction notice */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-blue-50/90 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 text-xs sm:text-sm text-blue-900 dark:text-blue-200 max-w-2xl mx-auto shadow-sm">
            <span className="font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              Rider App is 100% Free:
            </span>
            <span>Free to download &amp; use at no charge — R499/pm subscription applies <strong>strictly to drivers</strong> signing up.</span>
          </div>

          {!isStandalone && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-2.5 sm:gap-3 max-w-md sm:max-w-none mx-auto">
                <button
                  type="button"
                  onClick={() => installApp('rider')}
                  className="px-4 py-3 min-h-[48px] rounded-2xl sm:rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-95"
                >
                  <Download size={16} className="shrink-0" />
                  <span>Install Rider App (Free)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDriverInstall}
                  className="px-4 py-3 min-h-[48px] rounded-2xl sm:rounded-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-95"
                >
                  <Download size={16} className="shrink-0" />
                  <span>Install Driver App</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Rider app is free with zero monthly charges • R499/pm applies solely to driver accounts
              </p>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-1 text-sm">
            <Link href="/manual" className="px-4 py-2.5 min-h-[44px] rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 font-semibold transition flex items-center gap-2 shadow-sm">
              📘 Download Operational Manual (SOP)
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 pt-2 sm:pt-6 text-left max-w-5xl mx-auto">
          {/* Rider App Card */}
          <div className="group relative flex flex-col p-6 sm:p-8 lg:p-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-2xl dark:shadow-none border border-gray-200/70 dark:border-white/10 rounded-3xl sm:rounded-[2.25rem] lg:rounded-[2.5rem] hover:border-blue-500/50 hover:shadow-blue-500/20 hover:-translate-y-1.5 transition-all duration-300">
            <div className="block mb-6 flex-1">
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <div className="relative p-1 rounded-[1.5rem] bg-gradient-to-br from-blue-500 via-cyan-400 to-indigo-600 shadow-xl shadow-blue-500/25 group-hover:scale-105 transition-all duration-300">
                  <img
                    src="/rider-icon-512.png"
                    alt="SOLO Rider Portal Icon"
                    className="w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-[1.25rem] object-cover border border-white/20"
                  />
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="text-xs sm:text-sm font-extrabold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800/60 px-3.5 py-1.5 rounded-full">
                    100% Free Download
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    No Subscription • No Monthly Fee
                  </span>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-2.5 sm:mb-3 tracking-tight flex items-center gap-2">
                <span>Rider App</span>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                  Free at no charge
                </span>
              </h2>
              <p className="text-gray-700 dark:text-gray-300 text-base sm:text-lg leading-relaxed font-normal">
                Free to download at no charge. Book a ride instantly anywhere in South Africa with 0% platform markup. Pay your driver directly via their in-car <strong>Speedpoint machine</strong> (Card/Tap) or <strong>Cash</strong>.
              </p>

              <div className="mt-4 p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-xs sm:text-sm text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Sparkles size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Free for Riders:</strong> The R499/pm fee applies <strong>only to drivers</strong> signing up to earn on the platform. The rider app is completely free to install and use with no subscription.
                </span>
              </div>
            </div>
            
            <div className="mt-auto space-y-2.5">
              {isStandalone ? (
                <Link 
                  href="/rider" 
                  className="flex items-center justify-center gap-3 w-full py-4 min-h-[54px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all text-base sm:text-lg"
                >
                  <img src="/rider-icon-192.png" alt="" className="w-6 h-6 rounded-md object-cover border border-white/30" />
                  <span>Open Rider App (100% Free)</span>
                </Link>
              ) : (
                <button 
                  type="button"
                  onClick={() => installApp('rider')} 
                  className="flex items-center justify-center gap-3 w-full py-4 min-h-[54px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-2xl shadow-lg shadow-blue-500/25 active:scale-95 transition-all text-base sm:text-lg"
                >
                  <Download size={20} />
                  <span>Install Rider App (PWA)</span>
                </button>
              )}
              <div className="text-center font-bold text-xs sm:text-sm text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/60 py-2 px-3 rounded-xl border border-blue-200/60 dark:border-blue-800/40">
                100% Free to Download at No Charge • No Monthly Fee
              </div>
            </div>
          </div>

          {/* Driver Portal Card */}
          <div className="group relative flex flex-col p-6 sm:p-8 lg:p-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-2xl dark:shadow-none border border-gray-200/70 dark:border-white/10 rounded-3xl sm:rounded-[2.25rem] lg:rounded-[2.5rem] hover:border-green-500/50 hover:shadow-green-500/20 hover:-translate-y-1.5 transition-all duration-300">
            <div className="block mb-6 flex-1">
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <div className="relative p-1 rounded-[1.5rem] bg-gradient-to-br from-emerald-500 via-teal-400 to-green-600 shadow-xl shadow-emerald-500/25 group-hover:scale-105 transition-all duration-300">
                  <img
                    src="/driver-icon-512.png"
                    alt="SOLO Driver Portal Icon"
                    className="w-16 h-16 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-[1.25rem] object-cover border border-white/20"
                  />
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/60 px-3.5 py-1.5 rounded-full">
                    Drivers Only: 14 Days Free
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Then R499/pm SaaS
                  </span>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-2.5 sm:mb-3 tracking-tight">Driver Portal</h2>
              <p className="text-gray-700 dark:text-gray-300 text-base sm:text-lg leading-relaxed font-normal">
                Keep 100% of your rider fares paid directly via your required in-car <strong>Speedpoint machine</strong> or <strong>Cash</strong>. For drivers only: 14-day free trial, then a flat R499/pm SaaS fee (zero trip commissions).
              </p>

              <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                <Car size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Driver-Only Plan:</strong> The R499/pm flat fee applies exclusively to drivers so you keep 100% of your earnings without aggregator cuts.
                </span>
              </div>
            </div>

            <div className="mt-auto space-y-3">
              <Link 
                href="/driver/register" 
                className="flex items-center justify-center gap-2.5 w-full py-4 min-h-[54px] bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black rounded-2xl shadow-lg shadow-green-600/25 active:scale-95 transition-all text-base sm:text-lg"
              >
                <UserPlus size={20} /> Register as New Driver
              </Link>

              <div className={`grid ${!isStandalone ? "grid-cols-2" : "grid-cols-1"} gap-2.5 sm:gap-3`}>
                <Link
                  href="/driver"
                  className="flex items-center justify-center gap-2 py-3.5 px-3 min-h-[48px] bg-white dark:bg-zinc-800/90 text-gray-800 dark:text-gray-100 font-bold rounded-2xl shadow-sm hover:shadow border border-gray-200 dark:border-zinc-700 hover:border-green-300 dark:hover:border-green-700 transition-all text-sm sm:text-base text-center leading-tight"
                >
                  <Car size={18} className="text-green-500 shrink-0" />
                  <span>Driver Sign In</span>
                </Link>
                {!isStandalone && (
                  <button 
                    type="button"
                    onClick={handleDriverInstall} 
                    className="flex items-center justify-center gap-2 py-3.5 px-3 min-h-[48px] bg-white dark:bg-zinc-800/90 text-gray-800 dark:text-gray-100 font-bold rounded-2xl shadow-sm hover:shadow border border-gray-200 dark:border-zinc-700 hover:border-green-300 dark:hover:border-green-700 transition-all text-sm sm:text-base text-center leading-tight active:scale-95"
                  >
                    <Download size={18} className="shrink-0" />
                    <span>Install App</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Fleet Partner Hub Banner */}
          <div className="md:col-span-2 group relative flex flex-col sm:flex-row items-center justify-between p-6 sm:p-7 lg:p-8 bg-gradient-to-r from-purple-950/60 via-zinc-900/95 to-zinc-900/95 backdrop-blur-xl border border-purple-500/35 rounded-3xl sm:rounded-[2.25rem] lg:rounded-[2.5rem] hover:border-purple-500/60 transition-all duration-300 gap-5 sm:gap-6 shadow-xl">
            <div className="space-y-2.5 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider">
                <Building2 size={15} /> Fleet Partner Program
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">Own 2 or More Vehicles?</h3>
              <p className="text-gray-200 text-sm sm:text-base max-w-xl leading-relaxed">
                Replace 25% Uber &amp; Bolt aggregator deductions with a flat SaaS fee (R770/mo base + R499/veh). Manage multiple cars, live telematics, shift driver pairing, and cash/speedpoint remittance audits.
              </p>
            </div>
            <Link
              href="/fleet"
              className="shrink-0 flex items-center justify-center gap-2.5 px-6 py-4 min-h-[52px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/30 text-base transition-all active:scale-95 whitespace-nowrap"
            >
              <span>Open Fleet Hub</span>
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>

        <footer className="pt-8 border-t border-gray-200/60 dark:border-white/10 text-center space-y-1.5">
          <p className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-gray-600 dark:text-gray-400">
            Designed, Built & Maintained by{" "}
            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600">
              Boraine Tech (Pty) Ltd
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Boraine Tech (Pty) Ltd • All Rights Reserved
          </p>
        </footer>
      </main>
    </div>
  );
}
