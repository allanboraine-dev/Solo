import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://solo-lemon.vercel.app'

  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/driver',
        '/driver/register',
        '/driver/login',
        '/rider',
        '/fleet',
        '/manual',
        '/privacy',
        '/lost-phone',
      ],
      disallow: [
        '/admin/',
        '/api/',
        '/auth/',
        '/driver/portal',
        '/driver/trip',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
