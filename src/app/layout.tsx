import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navbar } from "@/components/Navbar";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SOLO | Zero-Commission E-Hailing",
  description: "Zero-Commission E-Hailing Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SOLO",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { PWAProvider } from "@/lib/PWAContext";
import GoogleMapsProvider from "@/components/GoogleMapsProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PWAProvider>
            <GoogleMapsProvider>
              <Navbar />
              <main className="min-h-screen pt-24">
                {children}
              </main>
              <InstallPrompt />
            </GoogleMapsProvider>
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
