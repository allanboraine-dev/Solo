"use client"

import { APIProvider } from '@vis.gl/react-google-maps';

export default function GoogleMapsProvider({ children }: { children: React.ReactNode }) {
  // If the key is missing, we still render children (the app), but the map will fail or show a placeholder.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'routes', 'geometry']}>
      {children}
    </APIProvider>
  );
}
