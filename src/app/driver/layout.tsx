import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Driver | Partner Portal",
  description: "SOLO Zero-Commission Driver Portal. Accept rides, keep 100% of your fares, and settle directly with riders via cash or your own card machine.",
  alternates: {
    canonical: "/driver",
  },
  openGraph: {
    title: "SOLO Driver | Zero-Commission Partner Portal",
    description: "Keep 100% of every fare you earn. Flat subscription, verified passengers, direct payment.",
    url: "https://solo-lemon.vercel.app/driver",
    siteName: "SOLO",
    locale: "en_ZA",
    type: "website",
    images: [{ url: "/driver-icon-512.png", width: 512, height: 512, alt: "SOLO Driver" }],
  },
  twitter: {
    card: "summary",
    title: "SOLO Driver | Zero-Commission Partner Portal",
    description: "Keep 100% of your fares. Connect directly with riders across South Africa.",
    images: ["/driver-icon-512.png"],
  },
  manifest: "/manifest-driver.json",
  icons: {
    icon: [
      { url: "/driver-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/driver-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/driver-icon-192.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOLO Driver",
  },
};

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
