/**
 * Commercial Map & Navigation Service (Mapbox + Fallback)
 * Powered by Mapbox Geocoding & Traffic Directions with automatic failover to OSRM/Nominatim
 */

export interface SearchResultPlace {
  id: string | number;
  name: string;
  display_name: string;
  lat: number;
  lon: number;
}

export interface RouteDetails {
  coordinates: [number, number][]; // [lat, lng] format for Leaflet Polyline
  distanceKm: number;
  durationMinutes: number;
  source: 'mapbox' | 'osrm';
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

/**
 * Forward Geocoding: Search South African addresses, landmarks, and POIs
 */
export async function searchPlaces(query: string): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();

  // 1. Try Mapbox Geocoding (South Africa country-code: 'za')
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?country=za&types=address,poi,place,neighborhood,locality&limit=6&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.features && Array.isArray(data.features) && data.features.length > 0) {
          return data.features.map((feat: any) => ({
            id: feat.id,
            name: feat.text || feat.place_name?.split(',')[0] || cleanQuery,
            display_name: feat.place_name,
            lat: feat.center[1], // Mapbox returns [lng, lat]
            lon: feat.center[0],
          }));
        }
      }
    } catch (err) {
      console.warn('Mapbox geocoding error, attempting fallback to Nominatim:', err);
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim
  try {
    const fallbackEndpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&countrycodes=za&addressdetails=1&limit=5`;
    const res = await fetch(fallbackEndpoint, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: item.place_id,
          name: item.name || item.display_name.split(',')[0],
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }));
      }
    }
  } catch (err) {
    console.error('All geocoding lookups failed:', err);
  }

  return [];
}

/**
 * Reverse Geocoding: Converts GPS coordinates into a readable South African address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // 1. Try Mapbox Reverse Geocoding
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=za&types=address,poi,place,neighborhood&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          return data.features[0].place_name || data.features[0].text;
        }
      }
    } catch (err) {
      console.warn('Mapbox reverse geocoding failed, attempting Nominatim:', err);
    }
  }

  // 2. Fallback to Nominatim
  try {
    const fallbackEndpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(fallbackEndpoint);
    if (res.ok) {
      const data = await res.json();
      if (data.display_name) {
        return data.display_name;
      }
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err);
  }

  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Turn-by-Turn Routing & Directions:
 * Queries Mapbox Driving Traffic (with live congestion) or falls back to OSRM
 */
export async function getRouteDirections(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number
): Promise<RouteDetails | null> {
  // 1. Try Mapbox Directions with live driving traffic
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          // GeoJSON coordinates are [lng, lat], Leaflet Polyline needs [lat, lng]
          const coords: [number, number][] = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]]
          );
          const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const durationMinutes = Math.max(1, Math.round(route.duration / 60));

          return {
            coordinates: coords,
            distanceKm,
            durationMinutes,
            source: 'mapbox',
          };
        }
      }
    } catch (err) {
      console.warn('Mapbox directions failed, falling back to OSRM:', err);
    }
  }

  // 2. Fallback to OSRM
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coords: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        const durationMinutes = Math.max(1, Math.round(route.duration / 60));

        return {
          coordinates: coords,
          distanceKm,
          durationMinutes,
          source: 'osrm',
        };
      }
    }
  } catch (err) {
    console.error('Both Mapbox and OSRM routing failed:', err);
  }

  return null;
}

/**
 * Calculates fare in South African Rand (ZAR)
 * Base fare: R20 | Per-km: R10 | Minimum fare: R30
 */
export function calculateFare(distanceKm: number): number {
  return Math.max(30, Math.round(20 + distanceKm * 10));
}

/**
 * Returns configuration for Leaflet TileLayer:
 * Uses high-DPI Mapbox Navigation / Streets tiles when token is available, with OSM fallback
 */
export function getTileLayerConfig(isDark: boolean = false) {
  if (MAPBOX_TOKEN) {
    // Style ID: navigation-day-v1 / navigation-night-v1
    const styleId = isDark ? 'navigation-night-v1' : 'navigation-day-v1';
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
      attribution:
        '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: -1,
    };
  }

  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    tileSize: 256,
    zoomOffset: 0,
  };
}
