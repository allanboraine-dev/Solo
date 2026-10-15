import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    id: '/driver',
    name: 'SOLO Driver | Zero Commission',
    short_name: 'SOLO Driver',
    description: 'Zero-Commission Driver Portal: keep 100% of your trip fares with R499/pm flat SaaS.',
    start_url: '/driver',
    scope: '/driver',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090b',
    theme_color: '#16a34a',
    categories: ['transportation', 'business'],
    icons: [
      {
        src: '/driver-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/driver-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png'
      }
    ],
    shortcuts: [
      {
        name: "Go Online",
        url: "/driver",
        icons: [{ src: "/driver-icon-192.png", sizes: "192x192" }]
      },
      {
        name: "Driver KYC Documents",
        url: "/driver",
        icons: [{ src: "/driver-icon-192.png", sizes: "192x192" }]
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    }
  });
}
