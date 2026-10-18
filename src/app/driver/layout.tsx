import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Driver | Partner Portal",
  description: "SOLO Zero-Commission Driver Portal. Accept rides and keep 100% of your fares.",
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
