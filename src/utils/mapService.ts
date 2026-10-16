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
  houseNumber?: string;
  street?: string;
  suburb?: string;
  city?: string;
  buildingName?: string;
  category?: 'address' | 'building' | 'poi' | 'area';
}

export interface RouteDetails {
  coordinates: [number, number][]; // [lat, lng] format for Leaflet Polyline
  distanceKm: number;
  durationMinutes: number;
  source: 'mapbox' | 'osrm';
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

// Default proximity bias: Kimberley CBD, Northern Cape (24.7623, -28.7282)
const DEFAULT_PROXIMITY = { lat: -28.7282, lng: 24.7623 };

/**
 * Extracts a leading house/unit/stand number from a user query if present.
 * Examples:
 *  - "14 Niobe Street" -> { houseNumber: "14", remainder: "Niobe Street" }
 *  - "14B Memorial Road" -> { houseNumber: "14B", remainder: "Memorial Road" }
 *  - "No. 22 Barkley Rd" -> { houseNumber: "22", remainder: "Barkley Rd" }
 */
export function parseHouseNumberFromQuery(query: string): {
  houseNumber?: string;
  remainder: string;
} {
  const trimmed = query.trim();
  const match = trimmed.match(/^(?:no\.?\s*|house\s*|erf\s*|stand\s*)?(\d+[a-zA-Z]?)\s+(.{2,})$/i);
  if (match) {
    return {
      houseNumber: match[1],
      remainder: match[2].trim(),
    };
  }
  return { remainder: trimmed };
}

/**
 * Formats a Nominatim result into a detailed SearchResultPlace with house numbers, building names, and streets
 */
function formatNominatimResult(item: any, userHouseNumber?: string): SearchResultPlace {
  const addr = item.address || {};
  const houseNumber = addr.house_number || userHouseNumber || undefined;
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.street ||
    addr.footway ||
    addr.path ||
    addr.residential ||
    undefined;
  const suburb =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.hamlet ||
    addr.village ||
    undefined;
  const city =
    addr.city ||
    addr.town ||
    addr.municipality ||
    addr.county ||
    addr.state_district ||
    undefined;

  const buildingCandidate =
    item.name ||
    addr.building ||
    addr.house_name ||
    addr.amenity ||
    addr.shop ||
    addr.office ||
    addr.tourism ||
    addr.healthcare ||
    addr.leisure ||
    undefined;

  // Determine if buildingCandidate is distinct from the street name
  const buildingName =
    buildingCandidate && (!street || buildingCandidate.toLowerCase() !== street.toLowerCase())
      ? buildingCandidate
      : undefined;

  const streetWithNumber = [houseNumber, street].filter(Boolean).join(' ').trim();

  let primaryName = '';
  let category: SearchResultPlace['category'] = 'area';

  if (buildingName && streetWithNumber) {
    primaryName = `${buildingName} (${streetWithNumber})`;
    category = 'building';
  } else if (buildingName) {
    primaryName = houseNumber ? `${houseNumber} ${buildingName}` : buildingName;
    category = item.class === 'building' || item.class === 'amenity' || item.class === 'shop' ? 'building' : 'poi';
  } else if (streetWithNumber) {
    primaryName = streetWithNumber;
    category = 'address';
  } else {
    const firstPart = (item.display_name || '').split(',')[0]?.trim() || 'Location';
    primaryName = houseNumber && !firstPart.startsWith(houseNumber) ? `${houseNumber} ${firstPart}` : firstPart;
  }

  const contextParts = [
    buildingName && streetWithNumber ? streetWithNumber : null,
    suburb,
    city,
    addr.state,
    addr.postcode,
  ].filter(Boolean);

  // Deduplicate adjacent identical parts
  const uniqueContext: string[] = [];
  for (const part of contextParts) {
    if (
      part &&
      !uniqueContext.some((p) => p.toLowerCase() === String(part).toLowerCase()) &&
      primaryName.toLowerCase() !== String(part).toLowerCase()
    ) {
      uniqueContext.push(String(part));
    }
  }

  const detailedDisplayName =
    uniqueContext.length > 0
      ? `${primaryName}, ${uniqueContext.join(', ')}`
      : item.display_name || primaryName;

  return {
    id: `nom-${item.place_id || `${item.lat}-${item.lon}`}-${houseNumber || ''}`,
    name: primaryName,
    display_name: detailedDisplayName,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    houseNumber,
    street,
    suburb,
    city,
    buildingName,
    category,
  };
}

/**
 * Formats a Mapbox Geocoding feature into a detailed SearchResultPlace preserving house numbers & POI addresses
 */
function formatMapboxFeature(feat: any, userHouseNumber?: string): SearchResultPlace {
  const placeTypes: string[] = Array.isArray(feat.place_type) ? feat.place_type : [];
  const isAddress = placeTypes.includes('address');
  const isPoi = placeTypes.includes('poi');

  const houseNumber = feat.address || userHouseNumber || undefined;
  const poiAddress = feat.properties?.address || undefined;

  let suburb: string | undefined;
  let city: string | undefined;
  if (Array.isArray(feat.context)) {
    for (const ctx of feat.context) {
      const id = String(ctx.id || '');
      if ((id.startsWith('neighborhood') || id.startsWith('locality')) && !suburb) {
        suburb = ctx.text;
      } else if (id.startsWith('place') && !city) {
        city = ctx.text;
      }
    }
  }

  let primaryName = feat.text || feat.place_name?.split(',')[0] || '';
  let street: string | undefined;
  let buildingName: string | undefined;
  let category: SearchResultPlace['category'] = 'area';

  if (isAddress) {
    street = feat.text;
    primaryName = [houseNumber, street].filter(Boolean).join(' ').trim();
    category = 'address';
  } else if (isPoi) {
    buildingName = feat.text;
    street = poiAddress;
    primaryName = poiAddress ? `${buildingName} (${poiAddress})` : buildingName || primaryName;
    category = 'building';
  } else if (houseNumber && !primaryName.startsWith(houseNumber)) {
    street = primaryName;
    primaryName = `${houseNumber} ${primaryName}`;
    category = 'address';
  }

  const rawPlaceName: string = feat.place_name || primaryName;
  const displayName =
    houseNumber && !rawPlaceName.toLowerCase().startsWith(houseNumber.toLowerCase())
      ? `${primaryName}, ${rawPlaceName.split(',').slice(1).join(',').trim() || rawPlaceName}`
      : rawPlaceName;

  return {
    id: `mbx-${feat.id}-${houseNumber || ''}`,
    name: primaryName,
    display_name: displayName,
    lat: feat.center[1],
    lon: feat.center[0],
    houseNumber,
    street,
    suburb,
    city,
    buildingName,
    category,
  };
}

/**
 * Forward Geocoding: Search South African house numbers, building/complex names, street addresses, landmarks, and POIs
 */
export async function searchPlaces(
  query: string,
  proximityCoords?: { lat: number; lng: number } | null
): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();
  const { houseNumber: parsedHouseNo, remainder: streetOrPlaceQuery } = parseHouseNumberFromQuery(cleanQuery);
  const prox = proximityCoords || DEFAULT_PROXIMITY;

  const combinedResults: SearchResultPlace[] = [];
  const seenKeys = new Set<string>();

  const addUniqueResult = (place: SearchResultPlace) => {
    if (Number.isNaN(place.lat) || Number.isNaN(place.lon)) return;
    const dedupeKey = `${place.name.toLowerCase()}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      combinedResults.push(place);
    }
  };

  // 1. Query Mapbox Geocoding (with autocomplete, fuzzyMatch, and proximity bias)
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        cleanQuery
      )}.json?country=za&autocomplete=true&fuzzyMatch=true&proximity=${prox.lng},${prox.lat}&types=address,poi,neighborhood,locality,place&limit=8&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.features && Array.isArray(data.features)) {
          data.features.forEach((feat: any) => {
            addUniqueResult(formatMapboxFeature(feat, parsedHouseNo));
          });
        }
      }
    } catch (err) {
      console.warn('Mapbox geocoding error, continuing with OpenStreetMap:', err);
    }
  }

  // 2. Query OpenStreetMap Nominatim with full addressdetails, namedetails & extratags for house numbers and buildings
  try {
    const viewbox = `${prox.lng - 0.35},${prox.lat + 0.35},${prox.lng + 0.35},${prox.lat - 0.35}`;
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      cleanQuery
    )}&countrycodes=za&addressdetails=1&namedetails=1&extratags=1&dedupe=0&viewbox=${viewbox}&bounded=0&limit=8`;
    const res = await fetch(nomUrl, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          addUniqueResult(formatNominatimResult(item, parsedHouseNo));
        });
      }
    }

    // 3. If user typed a specific house number (e.g. "14 Niobe Street") and the exact house node wasn't indexed separately,
    // also search the street/building remainder ("Niobe Street") and attach the house number so the exact street address is selectable
    if (parsedHouseNo && streetOrPlaceQuery.length >= 3 && combinedResults.length < 4) {
      const streetUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        streetOrPlaceQuery
      )}&countrycodes=za&addressdetails=1&namedetails=1&dedupe=0&viewbox=${viewbox}&bounded=0&limit=5`;
      const streetRes = await fetch(streetUrl, {
        headers: { Accept: 'application/json' },
      });
      if (streetRes.ok) {
        const streetData = await streetRes.json();
        if (Array.isArray(streetData)) {
          streetData.forEach((item: any) => {
            addUniqueResult(formatNominatimResult(item, parsedHouseNo));
          });
        }
      }
    }
  } catch (err) {
    console.error('Nominatim geocoding lookup error:', err);
  }

  return combinedResults.slice(0, 10);
}

/**
 * Reverse Geocoding: Converts GPS coordinates into a detailed South African street/building address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // 1. Try Mapbox Reverse Geocoding
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=za&types=address,poi,neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const formatted = formatMapboxFeature(data.features[0]);
          return formatted.display_name || formatted.name;
        }
      }
    } catch (err) {
      console.warn('Mapbox reverse geocoding failed, attempting Nominatim:', err);
    }
  }

  // 2. Fallback to Nominatim with addressdetails=1
  try {
    const fallbackEndpoint = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&namedetails=1`;
    const res = await fetch(fallbackEndpoint);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.address || data.display_name)) {
        const formatted = formatNominatimResult(data);
        return formatted.display_name || formatted.name;
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
