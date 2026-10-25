import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navbar } from "@/components/Navbar";
import { PWAProvider } from "@/lib/PWAContext";
import { OfflineIndicator } from "@/components/OfflineIndicator";

const inter = localFont({
  src: "./fonts/GeistVF.woff",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SOLO | Zero-Commission E-Hailing",
  description: "Zero-Commission E-Hailing Platform built for South Africa. Connecting riders directly with verified drivers.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOLO",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "color-scheme": "light dark",
    "supported-color-schemes": "light dark",
  },
  formatDetection: {
    telephone: true,
    date: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="samsung-viewport-sync"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function syncViewport() {
                  var vh = window.innerHeight * 0.01;
                  document.documentElement.style.setProperty('--vh', vh + 'px');
                }
                syncViewport();
                window.addEventListener('resize', syncViewport, { passive: true });
                window.addEventListener('orientationchange', syncViewport, { passive: true });

                try {
                  var path = window.location.pathname;
                  if (path.indexOf('/driver') === 0) {
                    localStorage.setItem('solo_installed_app_role', 'driver');
                    document.cookie = 'solo_installed_app_role=driver; path=/; max-age=31536000; SameSite=Lax';
                  } else if (path.indexOf('/rider') === 0) {
                    localStorage.setItem('solo_installed_app_role', 'rider');
                    document.cookie = 'solo_installed_app_role=rider; path=/; max-age=31536000; SameSite=Lax';
                  } else if (path === '/') {
                    var isStandalone =
                      window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true ||
                      window.location.search.indexOf('source=pwa') !== -1;
                    if (isStandalone) {
                      var role = localStorage.getItem('solo_installed_app_role');
                      if (!role) {
                        var match = document.cookie.match(/(?:^|;\\s*)solo_installed_app_role=(driver|rider)/);
                        if (match) role = match[1];
                      }
                      if (!role) {
                        if (localStorage.getItem('solo_driver_session')) role = 'driver';
                        else if (localStorage.getItem('solo_rider_session')) role = 'rider';
                      }
                      if (role === 'driver' || role === 'rider') {
                        window.location.replace('/' + role + '?source=pwa');
                      }
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <PWAProvider>
            <OfflineIndicator />
            <Navbar />
            <main className="min-h-[100dvh] pt-16 md:pt-24">
              {children}
            </main>
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
