"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type PWAContextType = {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  showIosGuide: boolean;
  setShowIosGuide: (show: boolean) => void;
  installApp: (role?: 'rider' | 'driver') => Promise<void>;
  dismissBanner: () => void;
  isBannerDismissed: boolean;
};

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  isStandalone: false,
  isIOS: false,
  isAndroid: false,
  showIosGuide: false,
  setShowIosGuide: () => {},
  installApp: async () => {},
  dismissBanner: () => {},
  isBannerDismissed: false,
});

const DISMISS_KEY = 'solo_pwa_install_dismissed_until';

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check standalone mode (Chrome PWA or iOS Home Screen WebClip)
    const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    // @ts-expect-error iOS Safari navigator.standalone check
    const isIosStandalone = window.navigator.standalone === true;
    const standalone = isStandaloneDisplay || isIosStandalone;
    setIsStandalone(standalone);

    // Platform detection
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !('MSStream' in window);
    const isAndroidDevice = /android/.test(ua);
    setIsIOS(isIosDevice);
    setIsAndroid(isAndroidDevice);

    // Check dismissal status in localStorage
    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        setIsBannerDismissed(true);
      } else {
        setIsBannerDismissed(standalone); // Don't show if already installed
      }
    } catch {
      setIsBannerDismissed(false);
    }

    // Capture Chrome/Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsBannerDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismissBanner = () => {
    setIsBannerDismissed(true);
    try {
      // Dismiss for 7 days
      const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(sevenDays));
    } catch {
      // storage unavailable
    }
  };

  const installApp = async (_role?: 'rider' | 'driver') => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsBannerDismissed(true);
      }
    } else if (isIOS) {
      setShowIosGuide(true);
    } else {
      // Fallback alert for desktop or other unsupported browsers
      alert(
        "To install SOLO on your device:\n" +
        "• Chrome/Edge: Click the install icon (⊕) in the browser address bar.\n" +
        "• Android: Tap the menu (⋮) and select 'Install app' or 'Add to Home screen'."
      );
    }
  };

  return (
    <PWAContext.Provider
      value={{
        isInstallable: !!deferredPrompt || isIOS,
        isStandalone,
        isIOS,
        isAndroid,
        showIosGuide,
        setShowIosGuide,
        installApp,
        dismissBanner,
        isBannerDismissed,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export const usePWA = () => useContext(PWAContext);
