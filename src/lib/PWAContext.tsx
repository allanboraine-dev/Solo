"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type PWAContextType = {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isStandalone: boolean;
};

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  installApp: async () => {},
  isStandalone: false,
});

export function PWAProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const isStandAloneMode = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(isStandAloneMode);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert("To install on iOS: Tap the Share button at the bottom of Safari, then scroll down and tap 'Add to Home Screen'.");
    }
  };

  return (
    <PWAContext.Provider value={{ isInstallable: !!deferredPrompt, installApp, isStandalone }}>
      {children}
    </PWAContext.Provider>
  );
}

export const usePWA = () => useContext(PWAContext);
