import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SOLO Fleet Partner Hub | Enterprise Fleet Operations',
  description:
    'Dedicated B2B Fleet Management Portal for South African e-hailing fleet owners. Real-time telematics, shift driver pairing, cash & Yoco reconciliation, and compliance tracking.',
  alternates: {
    canonical: '/fleet',
  },
  openGraph: {
    title: 'SOLO Fleet Partner Hub | Enterprise Fleet Operations',
    description:
      'Manage multi-vehicle fleets with zero platform commission. Shift audits, driver assignment, speedpoint reconciliation, and statutory compliance (NLTA & POPIA).',
    url: 'https://solo-lemon.vercel.app/fleet',
    siteName: 'SOLO',
    locale: 'en_ZA',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'SOLO Fleet Partner Hub | Enterprise Fleet Operations',
    description:
      'Manage multi-vehicle fleets with zero platform commission. Shift audits, driver assignment, and telematics tracking.',
  },
};

export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col pt-16 md:pt-20">
      {children}
    </div>
  );
}
