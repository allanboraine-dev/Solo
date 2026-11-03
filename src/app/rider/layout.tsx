import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Rider | Book a Ride",
  description: "SOLO Zero-Commission Rider App. Book safe, direct rides across South Africa. Pay the driver directly with cash or card.",
  alternates: {
    canonical: "/rider",
  },
  openGraph: {
    title: "SOLO Rider | Direct, Transparent Rides",
    description: "Book verified drivers directly. Transparent upfront pricing, zero platform middleman surcharge.",
    url: "https://solo-lemon.vercel.app/rider",
    siteName: "SOLO",
    locale: "en_ZA",
    type: "website",
    images: [{ url: "/rider-icon-512.png", width: 512, height: 512, alt: "SOLO Rider" }],
  },
  twitter: {
    card: "summary",
    title: "SOLO Rider | Direct, Transparent Rides",
    description: "Book verified drivers directly across South Africa.",
    images: ["/rider-icon-512.png"],
  },
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
