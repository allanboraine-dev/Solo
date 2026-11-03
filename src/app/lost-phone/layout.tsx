import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lost Phone Emergency Report | SOLO Support',
  description:
    'Lost your phone in a SOLO vehicle? Report your lost phone immediately without logging in. Emergency dispatch alerts the driver and begins secure chain-of-custody recovery.',
  alternates: {
    canonical: '/lost-phone',
  },
  openGraph: {
    title: 'SOLO Lost Phone Emergency Recovery Portal',
    description:
      'Zero-login emergency reporting for items and phones left in SOLO vehicles across South Africa. Direct driver dispatch and WhatsApp support integration.',
    url: 'https://solo-lemon.vercel.app/lost-phone',
    siteName: 'SOLO',
    locale: 'en_ZA',
    type: 'website',
  },
};

export default function LostPhoneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
