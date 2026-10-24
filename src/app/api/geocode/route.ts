import type { NextRequest } from 'next/server';
import { parseHouseNumberFromQuery, searchLocalPlaces } from '../../../utils/mapService.ts';
import { checkGeocodeRateLimit } from '../../../utils/rateLimit.ts';

export interface GeocodePlace {
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
  source?: string;
}

const MAPBOX_TOKEN =
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

// Default Kimberley CBD coordinates
const DEFAULT_PROXIMITY = { lat: -28.7282, lng: 24.7623 };

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function haversineDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Parses coordinates or Google Maps share links (e.g. -28.7415, 24.7670, @-28.74,24.76, ?q=-28.74,24.76)
 */
function parseCoordinatesOrGoogleUrl(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  // 1. Google Maps URL with @lat,lng
  const atMatch = trimmed.match(/@([-+]?\d{1,2}\.\d+),([-+]?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 2. Google Maps URL with ?q=lat,lng or query=lat,lng
  const qParamMatch = trimmed.match(/[?&](?:q|query|ll)=([-+]?\d{1,2}\.\d+)[,+]([-+]?\d{1,3}\.\d+)/);
  if (qParamMatch) {
    const lat = parseFloat(qParamMatch[1]);
    const lng = parseFloat(qParamMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 3. Direct decimal coordinates (e.g. -28.7415, 24.7670 or -28.7415 24.7670)
  const coordMatch = trimmed.match(/^([-+]?\d{1,2}\.\d+)[,\s]+([-+]?\d{1,3}\.\d+)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  // Enforce geocoding rate limits (45 req/min per IP)
  const rateLimit = checkGeocodeRateLimit(req);
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const q = searchParams.get('q')?.trim() || '';
  const houseNumberParam = searchParams.get('houseNumber')?.trim() || '';
  const streetParam = searchParams.get('street')?.trim() || '';
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  const lat = latStr ? parseFloat(latStr) : DEFAULT_PROXIMITY.lat;
  const lng = lngStr ? parseFloat(lngStr) : DEFAULT_PROXIMITY.lng;

  const defaultHeaders = {
    'User-Agent': 'SoloRides/1.0 (https://solo-rides.co.za; contact@solorides.co.za)',
    'Accept': 'application/json',
  };

  // 1. Handle Reverse Geocoding
  if (action === 'reverse') {
    if (isNaN(lat) || isNaN(lng)) {
      return Response.json({ success: false, error: 'Invalid coordinates' }, { status: 400 });
    }

    try {
      // 1.1 Try Mapbox reverse geocoding (fast, accurate for street numbers & suburbs)
      if (MAPBOX_TOKEN) {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=za&types=address,poi,neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`;
        const res = await fetchWithTimeout(endpoint, {}, 2500);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data.features) && data.features.length > 0) {
            const feat = data.features[0];
            return Response.json({
              success: true,
              address: feat.place_name || feat.text,
              source: 'mapbox',
            });
          }
        }
      }

      // 1.2 Try OpenStreetMap Nominatim reverse geocoding
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&namedetails=1`;
      const nomRes = await fetchWithTimeout(nomUrl, { headers: defaultHeaders }, 2500);
      if (nomRes && nomRes.ok) {
        const nomData = await nomRes.json();
        if (nomData && nomData.display_name) {
          return Response.json({
            success: true,
            address: nomData.display_name,
            source: 'nominatim',
          });
        }
      }
    } catch (err: any) {
      console.warn('[Geocode API] Reverse lookup error:', err?.message);
    }

    return Response.json({
      success: true,
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      source: 'coords_fallback',
    });
  }

  // 2. Handle Forward Geocoding / Search
  if (!q || q.length < 2) {
    return Response.json({ success: true, places: [] });
  }

  // 2.0 Check if user pasted exact coordinates or a Google Maps URL
  const parsedCoords = parseCoordinatesOrGoogleUrl(q);
  if (parsedCoords) {
    let resolvedAddress = `${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)}`;
    try {
      if (MAPBOX_TOKEN) {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${parsedCoords.lng},${parsedCoords.lat}.json?country=za&limit=1&access_token=${MAPBOX_TOKEN}`;
        const mRes = await fetchWithTimeout(endpoint, {}, 2000);
        if (mRes && mRes.ok) {
          const mData = await mRes.json();
          if (mData?.features?.[0]?.place_name) {
            resolvedAddress = mData.features[0].place_name;
          }
        }
      }
    } catch {}

    const directPlace: GeocodePlace = {
      id: `coords-${parsedCoords.lat}-${parsedCoords.lng}`,
      name: `Google Maps Pin (${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)})`,
      display_name: resolvedAddress,
      lat: parsedCoords.lat,
      lon: parsedCoords.lng,
      category: 'poi',
      source: 'google_pin',
    };

    return Response.json({
      success: true,
      places: [directPlace],
    });
  }

  // Extract house number and street name
  let targetHouseNo = houseNumberParam;
  let targetStreet = streetParam;
  if (!targetHouseNo) {
    const parsed = parseHouseNumberFromQuery(q);
    targetHouseNo = parsed.houseNumber || '';
    targetStreet = parsed.remainder || q;
  }

  const results: GeocodePlace[] = [];
  const seenKeys = new Set<string>();

  const addPlace = (place: GeocodePlace) => {
    if (isNaN(place.lat) || isNaN(place.lon)) return;
    const key = `${place.name.toLowerCase().trim()}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push(place);
    }
  };

  // --- 2.1 Check Instant Curated Local Kimberley Places First ---
  try {
    const localMatches = searchLocalPlaces(q, { lat, lng });
    for (const p of localMatches.slice(0, 8)) {
      addPlace({
        id: `local-${p.id}`,
        name: p.name,
        display_name: p.display_name,
        lat: p.lat,
        lon: p.lon,
        houseNumber: p.houseNumber,
        street: p.street,
        suburb: p.suburb,
        city: p.city,
        buildingName: p.buildingName,
        category: p.category,
        source: 'local',
      });
    }
  } catch (err: any) {
    console.warn('[Geocode API] Local search notice:', err?.message);
  }

  // Build search queries: full query, with house number, and with South Africa anchor
  const queryWithCountry = q.toLowerCase().includes('south africa') ? q : `${q}, South Africa`;
  const houseQueryWithCountry = targetHouseNo && targetStreet ? `${targetHouseNo} ${targetStreet}, South Africa` : '';

  // --- 2.2 Parallel Multi-Provider Search: Google Places (New), Mapbox & OpenStreetMap Nominatim ---
  // Run all providers concurrently with Promise.allSettled to guarantee rapid, rich responses!
  const parallelSearches: Promise<void>[] = [];

  // Provider A: Google Places API (New) Text Search
  if (GOOGLE_KEY) {
    const googlePromise = (async () => {
      try {
        const placesUrl = `https://places.googleapis.com/v1/places:searchText`;
        const pRes = await fetchWithTimeout(
          placesUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_KEY,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.location,places.types',
            },
            body: JSON.stringify({
              textQuery: houseQueryWithCountry || queryWithCountry,
              locationBias: {
                circle: {
                  center: { latitude: lat, longitude: lng },
                  radius: 50000.0,
                },
              },
            }),
          },
          3000
        );

        if (pRes && pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData.places)) {
            pData.places.forEach((p: any) => {
              const pLat = p.location?.latitude;
              const pLng = p.location?.longitude;
              if (pLat && pLng) {
                const name = p.displayName?.text || p.formattedAddress?.split(',')[0] || q;
                const types: string[] = Array.isArray(p.types) ? p.types : [];
                let category: GeocodePlace['category'] = 'building';
                if (types.some((t: string) => t.includes('park') || t.includes('stadium') || t.includes('point_of_interest') || t.includes('tourist_attraction'))) {
                  category = 'poi';
                } else if (types.some((t: string) => t.includes('street_address') || t.includes('premise') || t.includes('route') || t.includes('intersection'))) {
                  category = 'address';
                } else if (types.some((t: string) => t.includes('sublocality') || t.includes('neighborhood') || t.includes('locality'))) {
                  category = 'area';
                }

                let finalName = name;
                if (targetHouseNo && category === 'address' && !finalName.startsWith(targetHouseNo)) {
                  finalName = `${targetHouseNo} ${finalName}`;
                }

                addPlace({
                  id: `google-${p.id || `${pLat}-${pLng}`}`,
                  name: finalName,
                  display_name: p.formattedAddress || finalName,
                  lat: pLat,
                  lon: pLng,
                  buildingName: name,
                  houseNumber: targetHouseNo || undefined,
                  category,
                  source: 'google_places',
                });
              }
            });
          }
        }
      } catch (err: any) {
        console.warn('[Geocode API] Google Places notice:', err?.message);
      }
    })();
    parallelSearches.push(googlePromise);
  }

  // Provider B: Mapbox Geocoding (Outstanding for street names, house numbers, and South African cities)
  if (MAPBOX_TOKEN) {
    const mbxPromise = (async () => {
      try {
        const queryToSearch = targetHouseNo && targetStreet ? `${targetHouseNo} ${targetStreet}` : q;
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          queryToSearch
        )}.json?country=za&autocomplete=true&fuzzyMatch=true&proximity=${lng},${lat}&limit=10&access_token=${MAPBOX_TOKEN}`;
        const res = await fetchWithTimeout(endpoint, {}, 3000);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data.features)) {
            data.features.forEach((feat: any) => {
              const placeTypes: string[] = Array.isArray(feat.place_type) ? feat.place_type : [];
              const isAddress = placeTypes.includes('address');
              const isPoi = placeTypes.includes('poi');

              const featHouseNo = feat.address || undefined;
              const houseNo = featHouseNo || targetHouseNo || undefined;
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
              let category: GeocodePlace['category'] = 'area';

              if (isAddress) {
                street = feat.text;
                primaryName = [houseNo, street].filter(Boolean).join(' ').trim();
                category = 'address';
              } else if (isPoi) {
                buildingName = feat.text;
                street = poiAddress;
                primaryName = poiAddress ? `${buildingName} (${poiAddress})` : buildingName || primaryName;
                category = 'building';
              } else if (houseNo && !primaryName.startsWith(houseNo)) {
                street = primaryName;
                primaryName = `${houseNo} ${primaryName}`;
                category = 'address';
              }

              const rawPlaceName: string = feat.place_name || primaryName;
              const displayName =
                houseNo && !rawPlaceName.toLowerCase().startsWith(houseNo.toLowerCase())
                  ? `${primaryName}, ${rawPlaceName.split(',').slice(1).join(',').trim() || rawPlaceName}`
                  : rawPlaceName;

              const featLat = feat.center[1];
              const featLon = feat.center[0];

              addPlace({
                id: `mbx-${feat.id}-${houseNo || ''}`,
                name: primaryName,
                display_name: displayName,
                lat: featLat,
                lon: featLon,
                houseNumber: houseNo,
                street,
                suburb,
                city,
                buildingName,
                category,
                source: 'mapbox',
              });
            });
          }
        }
      } catch (err: any) {
        console.warn('[Geocode API] Mapbox lookup notice:', err?.message);
      }
    })();
    parallelSearches.push(mbxPromise);
  }

  // Provider C: OpenStreetMap Nominatim (Superb for South African landmarks, schools, clinics, hospitals, and suburbs)
  const nomPromise = (async () => {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        queryWithCountry
      )}&countrycodes=za&addressdetails=1&namedetails=1&extratags=1&limit=8`;

      const nomRes = await fetchWithTimeout(nomUrl, { headers: defaultHeaders }, 3000);
      if (nomRes && nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData)) {
          nomData.forEach((item: any) => {
            const itemLat = parseFloat(item.lat);
            const itemLon = parseFloat(item.lon);
            if (isNaN(itemLat) || isNaN(itemLon)) return;

            const addr = item.address || {};
            const houseNo = addr.house_number || targetHouseNo || undefined;
            const street = addr.road || addr.pedestrian || addr.street || undefined;
            const suburb = addr.suburb || addr.neighbourhood || addr.quarter || undefined;
            const city = addr.city || addr.town || addr.municipality || undefined;
            const buildingName = item.name && (!street || item.name !== street) ? item.name : undefined;

            const streetWithNumber = [houseNo, street].filter(Boolean).join(' ').trim();
            let primaryName = buildingName || streetWithNumber || (item.display_name || '').split(',')[0];
            if (houseNo && street && !primaryName.startsWith(houseNo)) {
              primaryName = `${houseNo} ${street}`;
            }

            addPlace({
              id: `nom-${item.place_id || `${itemLat}-${itemLon}`}-${houseNo || ''}`,
              name: primaryName,
              display_name: item.display_name || primaryName,
              lat: itemLat,
              lon: itemLon,
              houseNumber: houseNo,
              street,
              suburb,
              city,
              buildingName,
              category: buildingName ? 'building' : streetWithNumber ? 'address' : 'area',
              source: 'nominatim',
            });
          });
        }
      }
    } catch (err: any) {
      console.warn('[Geocode API] Nominatim lookup notice:', err?.message);
    }
  })();
  parallelSearches.push(nomPromise);

  // Provider D: Photon (Komoot OpenStreetMap index)
  const photonPromise = (async () => {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=8`;
      const pRes = await fetchWithTimeout(photonUrl, { headers: defaultHeaders }, 2500);
      if (pRes && pRes.ok) {
        const pData = await pRes.json();
        if (Array.isArray(pData.features)) {
          pData.features.forEach((feat: any) => {
            const props = feat.properties || {};
            const coords = feat.geometry?.coordinates;
            if (!coords || coords.length < 2) return;
            const featLat = coords[1];
            const featLon = coords[0];

            if (props.countrycode && props.countrycode.toUpperCase() !== 'ZA') return;

            const houseNo = props.housenumber || targetHouseNo || undefined;
            const isPropStreet =
              props.name && /\b(street|road|avenue|ave|crescent|drive|dr|way|lane|place|boulevard|blvd|str)\b/i.test(props.name);
            const street = props.street || (isPropStreet ? props.name : undefined);
            const suburb = props.district || props.suburb || undefined;
            const city = props.city || props.town || props.state || undefined;
            const buildingName = props.name && !isPropStreet && (!street || props.name !== street) ? props.name : undefined;

            const streetWithNumber = [houseNo, street].filter(Boolean).join(' ').trim();
            let primaryName = buildingName || streetWithNumber || props.name || q;
            if (buildingName && streetWithNumber) {
              primaryName = `${buildingName} (${streetWithNumber})`;
            }

            const contextParts = [suburb, city, props.state, props.postcode].filter(Boolean);
            const displayName = contextParts.length > 0 ? `${primaryName}, ${contextParts.join(', ')}` : primaryName;

            addPlace({
              id: `pho-${props.osm_id || `${coords[1]}-${coords[0]}`}-${houseNo || ''}`,
              name: primaryName,
              display_name: displayName,
              lat: coords[1],
              lon: coords[0],
              houseNumber: houseNo,
              street,
              suburb,
              city,
              buildingName,
              category: buildingName ? 'building' : streetWithNumber ? 'address' : 'area',
              source: 'photon',
            });
          });
        }
      }
    } catch (err: any) {
      console.warn('[Geocode API] Photon lookup notice:', err?.message);
    }
  })();
  parallelSearches.push(photonPromise);

  await Promise.allSettled(parallelSearches);

  // --- 2.3 Intelligent Geographic Distance & Relevance Sorting ---
  const qLower = q.toLowerCase();
  const qTokens = qLower.split(/[\s,]+/).filter((t) => t.length >= 2);

  results.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aDisplay = a.display_name.toLowerCase();
    const bDisplay = b.display_name.toLowerCase();

    // Exact match bonuses
    if (aName === qLower) scoreA += 300;
    if (bName === qLower) scoreB += 300;

    // Starts with match
    if (aName.startsWith(qLower)) scoreA += 150;
    if (bName.startsWith(qLower)) scoreB += 150;

    // Word boundary match
    const aWords = `${aName} ${aDisplay}`.split(/\s+/);
    const bWords = `${bName} ${bDisplay}`.split(/\s+/);
    for (const w of aWords) {
      if (w === qLower) { scoreA += 100; break; }
      else if (w.startsWith(qLower)) { scoreA += 60; break; }
    }
    for (const w of bWords) {
      if (w === qLower) { scoreB += 100; break; }
      else if (w.startsWith(qLower)) { scoreB += 60; break; }
    }

    // Token coverage
    for (const t of qTokens) {
      if (aName.includes(t)) scoreA += 40;
      else if (aDisplay.includes(t)) scoreA += 20;

      if (bName.includes(t)) scoreB += 40;
      else if (bDisplay.includes(t)) scoreB += 20;
    }

    // House number matches
    if (targetHouseNo) {
      if (a.houseNumber && a.houseNumber.toLowerCase() === targetHouseNo.toLowerCase()) scoreA += 150;
      if (b.houseNumber && b.houseNumber.toLowerCase() === targetHouseNo.toLowerCase()) scoreB += 150;
    }

    // Geographic Proximity Bonus: Places near the user/city get proximity priority
    const distA = haversineDistKm(lat, lng, a.lat, a.lon);
    const distB = haversineDistKm(lat, lng, b.lat, b.lon);

    if (distA <= 25) scoreA += 150;
    else if (distA <= 60) scoreA += 80;
    else if (distA <= 150) scoreA += 40;

    if (distB <= 25) scoreB += 150;
    else if (distB <= 60) scoreB += 80;
    else if (distB <= 150) scoreB += 40;

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    return distA - distB;
  });

  return Response.json({
    success: true,
    places: results.slice(0, 40),
  });
}
