import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOLO Driver",
  manifest: "/api/manifest/driver",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SOLO Driver",
  },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
