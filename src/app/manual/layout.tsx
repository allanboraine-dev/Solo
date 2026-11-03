import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operational Manual & SOP | SOLO E-Hailing Platform',
  description:
    'Comprehensive standard operating procedures for the SOLO Zero-Commission E-Hailing Platform. Compliant with NLTA Act 5 of 2009, SARS VAT Act 89 of 1991, and POPIA Act 4 of 2013.',
  alternates: {
    canonical: '/manual',
  },
  openGraph: {
    title: 'SOLO Operational Manual & Standard Operating Procedures',
    description:
      'Driver onboarding standards, in-car direct settlement protocol, lost property chain of custody, and regulatory compliance guidelines for South African transport operators.',
    url: 'https://solo-lemon.vercel.app/manual',
    siteName: 'SOLO',
    locale: 'en_ZA',
    type: 'article',
  },
};

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
