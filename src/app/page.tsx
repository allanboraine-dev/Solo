"use client"

import Link from "next/link";
import { Car, User, Map, Navigation, ShieldCheck, Download } from "lucide-react";
import { usePWA } from "@/lib/PWAContext";
import { useRouter } from "next/navigation";

export default function Home() {
  const { installApp } = usePWA();
  const router = useRouter();

  const handleDriverInstall = () => {
    router.push('/driver/register');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden pt-12 pb-24">
      {/* Modern Gradient Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-[100px] pointer-events-none z-0"></div>
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none z-0" 
           style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <main className="max-w-6xl w-full text-center space-y-20 p-8 relative z-10">
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="flex justify-center mb-6">
            <div className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md text-blue-600 dark:text-blue-400 p-5 rounded-full shadow-xl shadow-blue-500/10 border border-white/20 dark:border-white/5">
              <Navigation size={48} strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter leading-tight">
            Move Freely <br className="hidden md:block"/> with <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">SOLO</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
            The Zero-Commission E-Hailing Platform built for South Africa.
          </p>
          
          <div className="flex flex-wrap justify-center gap-3 pt-6 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200/50 dark:border-white/5 shadow-sm"><ShieldCheck size={18} className="text-green-500"/> Verified Drivers</div>
            <div className="flex items-center gap-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200/50 dark:border-white/5 shadow-sm"><Map size={18} className="text-blue-500"/> Real-time Tracking</div>
            <div className="flex items-center gap-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200/50 dark:border-white/5 shadow-sm"><Car size={18} className="text-purple-500"/> 7 Days Free, then R999/pm</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 text-left max-w-5xl mx-auto">
          <div className="group relative flex flex-col p-10 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl shadow-2xl dark:shadow-none border border-white/40 dark:border-white/10 rounded-[2.5rem] hover:border-blue-500/50 hover:shadow-blue-500/20 hover:-translate-y-2 transition-all duration-300">
            <Link href="/rider" className="block mb-8 flex-1">
              <div className="p-5 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 text-blue-600 rounded-3xl w-fit mb-8 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                <User size={36} />
              </div>
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Rider App</h2>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed font-light">Book a ride instantly anywhere in SA. Pay fairly with zero platform commissions baked into your fare.</p>
            </Link>
            <button onClick={installApp} className="mt-auto flex items-center justify-center gap-3 w-full py-4 bg-white dark:bg-black text-blue-600 dark:text-blue-400 font-bold rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900 transition-all">
              <Download size={20} /> Install Rider App
            </button>
          </div>

          <div className="group relative flex flex-col p-10 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl shadow-2xl dark:shadow-none border border-white/40 dark:border-white/10 rounded-[2.5rem] hover:border-green-500/50 hover:shadow-green-500/20 hover:-translate-y-2 transition-all duration-300">
            <Link href="/driver" className="block mb-8 flex-1">
              <div className="p-5 bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-800/20 text-green-600 rounded-3xl w-fit mb-8 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300">
                <Car size={36} />
              </div>
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Driver Portal</h2>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed font-light">Get your first 7 days free, then a flat R999/pm. Accept rides, keep 100% of your earnings, and take control of your transport business.</p>
            </Link>
            <button onClick={handleDriverInstall} className="mt-auto flex items-center justify-center gap-3 w-full py-4 bg-white dark:bg-black text-green-600 dark:text-green-400 font-bold rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-zinc-800 hover:border-green-200 dark:hover:border-green-900 transition-all">
              <Download size={20} /> Install Driver App
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
