import type { Metadata } from "next";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";

export const metadata: Metadata = {
  title: "SOLO Rider | Fair Rides",
  description: "Book fair, transparent rides across South Africa. Zero commission markup, verified drivers.",
  manifest: "/api/manifest/rider",
  icons: {
    icon: [
      { url: "/rider-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/rider-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOLO Rider",
  },
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PWAInstallBanner role="rider" appName="SOLO Rider" />
    </>
  );
}
