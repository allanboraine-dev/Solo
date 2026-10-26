"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Share, PlusSquare, MoreVertical, Smartphone, X, CheckCircle2 } from 'lucide-react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PortalRole = 'rider' | 'driver';

type PWAContextType = {
  isInstallable: boolean;
  isStandalone: boolean;
  isInstalled: boolean;
  isPwaReady: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  installedRole: PortalRole | null;
  showIosGuide: boolean;
  setShowIosGuide: (show: boolean) => void;
  installApp: (role?: PortalRole) => Promise<void>;
  dismissBanner: () => void;
  isBannerDismissed: boolean;
};

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  isStandalone: false,
  isInstalled: false,
  isPwaReady: false,
  isIOS: false,
  isAndroid: false,
  installedRole: null,
  showIosGuide: false,
  setShowIosGuide: () => {},
  installApp: async () => {},
  dismissBanner: () => {},
  isBannerDismissed: true,
});

const DISMISS_KEY = 'solo_pwa_install_dismissed_until';
export const INSTALLED_ROLE_KEY = 'solo_installed_app_role';
export const INSTALLED_FLAG_KEY = 'solo_pwa_installed';
export const PWA_SESSION_KEY = 'solo_pwa_session';

function persistInstalledRole(role: PortalRole) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSTALLED_ROLE_KEY, role);
  } catch {
    // ignore storage errors
  }
  try {
    document.cookie = `${INSTALLED_ROLE_KEY}=${role}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore cookie errors
  }
}

export function markAppAsInstalled(role?: PortalRole) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSTALLED_FLAG_KEY, 'true');
    if (role) {
      localStorage.setItem(`${INSTALLED_FLAG_KEY}_${role}`, 'true');
      localStorage.setItem(INSTALLED_ROLE_KEY, role);
    }
  } catch {
    // ignore storage errors
  }
  try {
    sessionStorage.setItem(PWA_SESSION_KEY, 'true');
  } catch {
    // ignore session storage errors
  }
  try {
    document.cookie = `${INSTALLED_FLAG_KEY}=true; path=/; max-age=31536000; SameSite=Lax`;
    if (role) {
      document.cookie = `${INSTALLED_FLAG_KEY}_${role}=true; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `${INSTALLED_ROLE_KEY}=${role}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch {
    // ignore cookie errors
  }
}

export function detectStandaloneOrInstalled(_role?: PortalRole): {
  standaloneDisplay: boolean;
  alreadyInstalled: boolean;
} {
  if (typeof window === 'undefined') {
    return { standaloneDisplay: false, alreadyInstalled: false };
  }

  let isDisplayStandalone = false;
  try {
    if (window.matchMedia) {
      isDisplayStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches;
    }
  } catch {}

  // @ts-expect-error iOS Safari navigator.standalone check
  const isIosStandalone = typeof navigator !== 'undefined' && window.navigator.standalone === true;

  let isTwa = false;
  try {
    isTwa = typeof document !== 'undefined' && document.referrer.includes('android-app://');
  } catch {}

  let isPwaSource = false;
  try {
    const search = window.location.search || '';
    isPwaSource = search.includes('source=pwa') || search.includes('mode=standalone');
  } catch {}

  let hasSessionFlag = false;
  try {
    hasSessionFlag = sessionStorage.getItem(PWA_SESSION_KEY) === 'true';
  } catch {}

  const standaloneDisplay = isDisplayStandalone || isIosStandalone || isTwa || isPwaSource || hasSessionFlag;
  const alreadyInstalled = standaloneDisplay;

  return { standaloneDisplay, alreadyInstalled };
}

export function getPersistedInstalledRole(): PortalRole | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(INSTALLED_ROLE_KEY);
    if (stored === 'driver' || stored === 'rider') return stored;
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)solo_installed_app_role=(driver|rider)/);
    if (match && (match[1] === 'driver' || match[1] === 'rider')) {
      return match[1];
    }
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem('solo_driver_session') || localStorage.getItem('driver_id')) return 'driver';
    if (localStorage.getItem('solo_rider_session') || localStorage.getItem('solo_verified_rider')) return 'rider';
  } catch {
    // ignore
  }
  return null;
}

function syncDocumentManifestAndIcons(role: PortalRole) {
  if (typeof document === 'undefined') return;
  try {
    const manifestHref = role === 'driver' ? '/manifest-driver.json' : '/manifest-rider.json';
    const iconHref = role === 'driver' ? '/driver-icon-192.png' : '/rider-icon-192.png';
    const appTitle = role === 'driver' ? 'SOLO Driver' : 'SOLO Rider';

    const manifestLinks = document.querySelectorAll('link[rel="manifest"]');
    if (manifestLinks.length > 0) {
      manifestLinks.forEach((link, idx) => {
        if (idx === 0) {
          (link as HTMLLinkElement).href = manifestHref;
        } else {
          link.parentNode?.removeChild(link);
        }
      });
    } else {
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = manifestHref;
      document.head.appendChild(manifestLink);
    }

    const appleIconLinks = document.querySelectorAll('link[rel="apple-touch-icon"]');
    if (appleIconLinks.length > 0) {
      appleIconLinks.forEach((link) => {
        (link as HTMLLinkElement).href = iconHref;
      });
    } else {
      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.href = iconHref;
      document.head.appendChild(appleLink);
    }

    let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    if (appleTitleMeta) {
      appleTitleMeta.content = appTitle;
    } else {
      appleTitleMeta = document.createElement('meta');
      appleTitleMeta.name = 'apple-mobile-web-app-title';
      appleTitleMeta.content = appTitle;
      document.head.appendChild(appleTitleMeta);
    }
  } catch {
    // ignore DOM mutation errors
  }
}

export function PWAProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPwaReady, setIsPwaReady] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [installedRole, setInstalledRole] = useState<PortalRole | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [guideRole, setGuideRole] = useState<PortalRole>('rider');
  const [isBannerDismissed, setIsBannerDismissed] = useState(true);

  // Sync active portal role, manifest & installed status whenever route changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentRole = getPersistedInstalledRole();
    if (currentRole) {
      setInstalledRole(currentRole);
    }

    let activePortalRole: PortalRole | undefined = currentRole || undefined;
    if (pathname?.startsWith('/driver')) {
      activePortalRole = 'driver';
      persistInstalledRole('driver');
      setInstalledRole('driver');
      setGuideRole('driver');
      syncDocumentManifestAndIcons('driver');
    } else if (pathname?.startsWith('/rider')) {
      activePortalRole = 'rider';
      persistInstalledRole('rider');
      setInstalledRole('rider');
      setGuideRole('rider');
      syncDocumentManifestAndIcons('rider');
    }

    const { standaloneDisplay, alreadyInstalled } = detectStandaloneOrInstalled(activePortalRole);
    if (standaloneDisplay) {
      markAppAsInstalled(activePortalRole);
    }
    setIsStandalone(standaloneDisplay);
    setIsInstalled(alreadyInstalled);
    if (alreadyInstalled) {
      setIsBannerDismissed(true);
    }

    // Check if we navigated to /driver?install=driver or /rider?install=rider from the home page
    const params = new URLSearchParams(window.location.search);
    const installParam = params.get('install');
    if (installParam === 'driver' || installParam === 'rider' || installParam === 'true') {
      const targetRole: PortalRole =
        installParam === 'driver' || installParam === 'rider'
          ? installParam
          : pathname?.startsWith('/driver')
          ? 'driver'
          : 'rider';

      persistInstalledRole(targetRole);
      setInstalledRole(targetRole);
      setGuideRole(targetRole);
      syncDocumentManifestAndIcons(targetRole);

      if (!standaloneDisplay) {
        setShowIosGuide(true);
      }

      // Clean up the ?install= query parameter without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedRole = getPersistedInstalledRole();
    if (savedRole) {
      setInstalledRole(savedRole);
      syncDocumentManifestAndIcons(savedRole);
    }

    const { standaloneDisplay, alreadyInstalled } = detectStandaloneOrInstalled(savedRole || undefined);
    if (standaloneDisplay) {
      markAppAsInstalled(savedRole || undefined);
    }

    setIsStandalone(standaloneDisplay);
    setIsInstalled(alreadyInstalled);
    setIsPwaReady(true);

    // Platform detection
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !('MSStream' in window);
    const isAndroidDevice = /android/.test(ua);
    setIsIOS(isIosDevice);
    setIsAndroid(isAndroidDevice);

    // If launched in standalone mode on the root home page ('/'), immediately redirect to the installed portal!
    if (standaloneDisplay && window.location.pathname === '/') {
      const targetRole = savedRole || 'rider';
      router.replace(`/${targetRole}`);
    }

    // Check dismissal status in localStorage
    try {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (alreadyInstalled || (dismissedUntil && Number(dismissedUntil) > Date.now())) {
        setIsBannerDismissed(true);
      } else {
        setIsBannerDismissed(false);
      }
    } catch {
      setIsBannerDismissed(alreadyInstalled);
    }

    // Listen to display-mode changes dynamically
    let mediaQuery: MediaQueryList | null = null;
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        const activeRole: PortalRole = window.location.pathname.startsWith('/driver')
          ? 'driver'
          : window.location.pathname.startsWith('/rider')
          ? 'rider'
          : getPersistedInstalledRole() || 'rider';
        markAppAsInstalled(activeRole);
        setIsStandalone(true);
        setIsInstalled(true);
        setIsBannerDismissed(true);
        setShowIosGuide(false);
      }
    };
    try {
      if (window.matchMedia) {
        mediaQuery = window.matchMedia('(display-mode: standalone)');
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', handleDisplayModeChange);
        }
      }
    } catch {}

    // Capture Chrome/Android beforeinstallprompt event (including early pre-hydration capture)
    const win = window as Window & { __soloDeferredPrompt?: BeforeInstallPromptEvent | null };
    if (win.__soloDeferredPrompt && !standaloneDisplay) {
      setDeferredPrompt(win.__soloDeferredPrompt);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration('/')
        .then((reg) => {
          if (!reg) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      win.__soloDeferredPrompt = e as BeforeInstallPromptEvent;
      const { standaloneDisplay: isCurrentlyStandalone } = detectStandaloneOrInstalled();
      if (!isCurrentlyStandalone) {
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      const activeRole: PortalRole = window.location.pathname.startsWith('/driver')
        ? 'driver'
        : window.location.pathname.startsWith('/rider')
        ? 'rider'
        : getPersistedInstalledRole() || 'rider';

      persistInstalledRole(activeRole);
      markAppAsInstalled(activeRole);
      setInstalledRole(activeRole);
      win.__soloDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsInstalled(true);
      setIsBannerDismissed(true);
      setShowIosGuide(false);

      // Ensure user lands directly in the portal they installed
      if (window.location.pathname === '/') {
        const hasDriverAuth =
          activeRole === 'driver' &&
          (localStorage.getItem('driver_id') || localStorage.getItem('mock_driver_profile'));
        router.replace(activeRole === 'driver' && !hasDriverAuth ? '/driver/login' : `/${activeRole}`);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      try {
        if (mediaQuery && mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleDisplayModeChange);
        }
      } catch {}
    };
  }, [router]);

  const dismissBanner = () => {
    setIsBannerDismissed(true);
    try {
      const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(sevenDays));
    } catch {
      // storage unavailable
    }
  };

  const installApp = async (role?: PortalRole) => {
    const targetRole: PortalRole =
      role ||
      (pathname?.startsWith('/driver')
        ? 'driver'
        : pathname?.startsWith('/rider')
        ? 'rider'
        : installedRole || 'rider');

    const { standaloneDisplay } = detectStandaloneOrInstalled(targetRole);
    if (standaloneDisplay) {
      markAppAsInstalled(targetRole);
      setIsStandalone(true);
      setIsInstalled(true);
      setIsBannerDismissed(true);
      setShowIosGuide(false);
      if (!pathname?.startsWith(`/${targetRole}`)) {
        router.push(`/${targetRole}`);
      }
      return;
    }

    // 1. Persist the target portal role first
    persistInstalledRole(targetRole);
    setInstalledRole(targetRole);
    setGuideRole(targetRole);

    // 2. If native Android/Chrome install prompt is ready, trigger it immediately inside the user click gesture
    const win = typeof window !== 'undefined' ? (window as Window & { __soloDeferredPrompt?: BeforeInstallPromptEvent | null }) : null;
    const activePrompt = deferredPrompt || win?.__soloDeferredPrompt || null;

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        if (win) win.__soloDeferredPrompt = null;
        setDeferredPrompt(null);
        syncDocumentManifestAndIcons(targetRole);
        if (choice.outcome === 'accepted') {
          markAppAsInstalled(targetRole);
          setIsStandalone(true);
          setIsInstalled(true);
          setIsBannerDismissed(true);
          setShowIosGuide(false);
          if (!pathname?.startsWith(`/${targetRole}`)) {
            let hasDriverAuth = false;
            try {
              hasDriverAuth = Boolean(localStorage.getItem('driver_id') || localStorage.getItem('mock_driver_profile'));
            } catch {}
            router.push(targetRole === 'driver' && !hasDriverAuth ? '/driver/login' : `/${targetRole}`);
          }
          return;
        }
      } catch (err) {
        console.warn('deferredPrompt error:', err);
      }
    }

    // 3. Sync manifest + icons for the target portal
    syncDocumentManifestAndIcons(targetRole);

    // 4. If we are not yet on the target portal URL (e.g., user tapped Install Driver App on '/'),
    // navigate to the target portal route with ?install=<role> so mobile Safari / Chrome
    // bookmarks the dedicated /driver or /rider portal URL and manifest!
    if (!pathname?.startsWith(`/${targetRole}`)) {
      let targetDestination = `/${targetRole}`;
      if (targetRole === 'driver' && typeof window !== 'undefined') {
        try {
          const hasDriverAuth = Boolean(localStorage.getItem('driver_id') || localStorage.getItem('mock_driver_profile'));
          if (!hasDriverAuth) {
            targetDestination = '/driver/login';
          }
        } catch {}
      }
      setShowIosGuide(true);
      router.push(`${targetDestination}?install=${targetRole}`);
      return;
    }

    // 5. Show the role-aware mobile install guide modal
    setShowIosGuide(true);
  };

  const handleConfirmManualInstall = () => {
    dismissBanner();
    setShowIosGuide(false);
  };

  const portalLabel = guideRole === 'driver' ? 'SOLO Driver Portal' : 'SOLO Rider App';
  const portalIcon = guideRole === 'driver' ? '/driver-icon-192.png' : '/rider-icon-192.png';
  const accentBg =
    guideRole === 'driver'
      ? 'from-emerald-600 to-teal-600 border-emerald-500/40'
      : 'from-blue-600 to-indigo-600 border-blue-500/40';

  const effectiveStandalone = isStandalone || isInstalled;

  return (
    <PWAContext.Provider
      value={{
        isInstallable: !isStandalone && (!!deferredPrompt || isIOS),
        isStandalone,
        isInstalled: effectiveStandalone,
        isPwaReady,
        isIOS,
        isAndroid,
        installedRole,
        showIosGuide,
        setShowIosGuide,
        installApp,
        dismissBanner,
        isBannerDismissed: effectiveStandalone || isBannerDismissed,
      }}
    >
      {children}

      {/* Role-Aware Mobile & Desktop Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className={`bg-gradient-to-r ${accentBg} p-4 text-white flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-3">
                <img
                  src={portalIcon}
                  alt={portalLabel}
                  className="w-11 h-11 rounded-2xl border border-white/30 shadow-md object-cover"
                />
                <div>
                  <h3 className="font-black text-base tracking-tight">Install {portalLabel}</h3>
                  <p className="text-xs text-white/85">
                    Opens directly into the {guideRole === 'driver' ? 'Driver Portal' : 'Rider Portal'} from your Home Screen
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white transition"
                aria-label="Close install guide"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm text-gray-700 dark:text-gray-200">
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={() => installApp(guideRole)}
                  className={`w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r ${accentBg} text-white font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition`}
                >
                  <Download size={18} />
                  <span>Install {portalLabel} Now</span>
                </button>
              )}

              {isIOS ? (
                <div className="space-y-3">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    To install <strong>{portalLabel}</strong> on your iPhone or iPad:
                  </p>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                      <Share size={18} />
                    </div>
                    <span>
                      1. Tap the <strong>Share</strong> button at the bottom of Safari.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                      <PlusSquare size={18} />
                    </div>
                    <span>
                      2. Scroll down and tap <strong>Add to Home Screen</strong>.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <span>
                      3. Tap <strong>Add</strong> — launching the icon will open the{' '}
                      <strong>{guideRole === 'driver' ? 'Driver Portal' : 'Rider Portal'}</strong> directly!
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    To install <strong>{portalLabel}</strong> on your Android / mobile device:
                  </p>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                      <MoreVertical size={18} />
                    </div>
                    <span>
                      1. Tap the browser menu <strong>(⋮)</strong> in the top-right corner (or <strong>(≡)</strong> in Samsung Internet).
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <span>
                      2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <span>
                      3. Tap <strong>Install</strong> — launching the icon opens the{' '}
                      <strong>{guideRole === 'driver' ? 'Driver Portal' : 'Rider Portal'}</strong> directly!
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmManualInstall}
                  className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 size={15} />
                  <span>Already Installed</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowIosGuide(false)}
                  className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-bold text-xs uppercase tracking-wider transition"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PWAContext.Provider>
  );
}

export const usePWA = () => useContext(PWAContext);
