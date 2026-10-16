import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navbar } from "@/components/Navbar";
import { PWAProvider } from "@/lib/PWAContext";
import { OfflineIndicator } from "@/components/OfflineIndicator";

const inter = Inter({ subsets: ["latin"] });

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
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

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
