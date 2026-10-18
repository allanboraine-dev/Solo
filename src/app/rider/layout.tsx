import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Rider | Book a Ride",
  description: "SOLO Zero-Commission Rider App. Book safe, direct rides across South Africa.",
  manifest: "/manifest-rider.json",
  icons: {
    icon: [
      { url: "/rider-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/rider-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/rider-icon-192.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOLO Rider",
  },
};

export default function RiderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
