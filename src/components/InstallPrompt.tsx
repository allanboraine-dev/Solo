'use client';

import { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Detect if app is already installed
    const isStandAloneMode = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(isStandAloneMode);

    // Handle Android install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isStandAloneMode) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Show iOS prompt if not installed
    if (isIosDevice && !isStandAloneMode) {
      // Small delay so it's not instantly annoying
      const timer = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
  };

  if (isStandalone) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-zinc-900 border-t border-zinc-800 shadow-2xl rounded-t-xl sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[400px] sm:rounded-xl sm:border"
        >
          <button
            onClick={dismissPrompt}
            className="absolute top-2 right-2 p-2 text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
          
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <h3 className="text-lg font-semibold text-white">Install SOLO</h3>
              <p className="text-sm text-zinc-400">
                Install our app for the best experience.
              </p>
            </div>

            {isIOS ? (
              <div className="bg-zinc-800 p-4 rounded-lg text-sm text-zinc-300 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span>1. Tap the Share button</span>
                  <Share size={18} className="text-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span>2. Select &quot;Add to Home Screen&quot;</span>
                  <PlusSquare size={18} />
                </div>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full bg-white text-black py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Install App
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
