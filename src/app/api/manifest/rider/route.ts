import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'SOLO Rider',
    short_name: 'SOLO Rider',
    description: 'Zero-Commission E-Hailing for Riders',
    start_url: '/rider',
    scope: '/rider',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/manifest+json'
    }
  });
}
