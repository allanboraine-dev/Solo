import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Rider",
  manifest: "/api/manifest/rider",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SOLO Rider",
  },
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
