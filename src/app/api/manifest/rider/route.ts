import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    id: '/rider',
    name: 'SOLO Rider | Fair Rides',
    short_name: 'SOLO Rider',
    description: 'Zero-commission e-hailing for South African commuters. Direct driver payment, fair fares.',
    start_url: '/rider?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#09090b',
    theme_color: '#2563eb',
    categories: ['travel', 'transportation'],
    prefer_related_applications: false,
    related_applications: [
      {
        platform: 'webapp',
        url: '/manifest-rider.json'
      },
      {
        platform: 'webapp',
        url: '/manifest.json'
      }
    ],
    icons: [
      {
        src: '/rider-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/rider-icon-512.png',
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
        name: "Book a Ride",
        url: "/rider?source=pwa",
        icons: [{ src: "/rider-icon-192.png", sizes: "192x192" }]
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    }
  });
}
