import type { Metadata } from "next";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";

export const metadata: Metadata = {
  title: "SOLO Driver | Zero Commission",
  description: "Keep 100% of your e-hailing fares with SOLO Driver. Flat R499/pm SaaS subscription with 7-day free trial.",
  manifest: "/api/manifest/driver",
  icons: {
    icon: [
      { url: "/driver-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/driver-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOLO Driver",
  },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PWAInstallBanner role="driver" appName="SOLO Driver" />
    </>
  );
}
