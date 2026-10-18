import { NextRequest, NextResponse } from 'next/server';
import { parseHouseNumberFromQuery } from '@/utils/mapService';

interface GeocodePlace {
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

const MAPBOX_TOKEN =
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  '';

// Default Kimberley CBD coordinates
const DEFAULT_PROXIMITY = { lat: -28.7282, lng: 24.7623 };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const q = searchParams.get('q')?.trim() || '';
  const houseNumberParam = searchParams.get('houseNumber')?.trim() || '';
  const streetParam = searchParams.get('street')?.trim() || '';
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  const lat = latStr ? parseFloat(latStr) : DEFAULT_PROXIMITY.lat;
  const lng = lngStr ? parseFloat(lngStr) : DEFAULT_PROXIMITY.lng;

  // 1. Handle Reverse Geocoding
  if (action === 'reverse') {
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ success: false, error: 'Invalid coordinates' }, { status: 400 });
    }

    try {
      // 1.1 Try Mapbox reverse geocoding
      if (MAPBOX_TOKEN) {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=za&types=address,poi,neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(endpoint, { next: { revalidate: 60 } });
        if (res.ok) {
          const data = await res.json();
          if (data.features && data.features.length > 0) {
            const feat = data.features[0];
            return NextResponse.json({
              success: true,
              address: feat.place_name || feat.text,
              source: 'mapbox',
            });
          }
        }
      }

      // 1.2 Try OpenStreetMap Nominatim with official User-Agent
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&namedetails=1`;
      const nomRes = await fetch(nomUrl, {
        headers: {
          'User-Agent': 'SoloRides/1.0 (https://solo-rides.co.za; contact@solorides.co.za)',
          Accept: 'application/json',
        },
        next: { revalidate: 60 },
      });
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (nomData && nomData.display_name) {
          return NextResponse.json({
            success: true,
            address: nomData.display_name,
            source: 'nominatim',
          });
        }
      }
    } catch (err: any) {
      console.warn('[Geocode API] Reverse lookup error:', err);
    }

    return NextResponse.json({
      success: true,
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      source: 'coords_fallback',
    });
  }

  // 2. Handle Forward Geocoding / Search
  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, places: [] });
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
    const key = `${place.name.toLowerCase()}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push(place);
    }
  };

  const queryVariants = Array.from(
    new Set([q, targetStreet, `${targetStreet || q}, Kimberley`, `${targetStreet || q}, Northern Cape`])
  ).filter((s): s is string => Boolean(s && s.trim().length >= 2));

  // 2.1 Try Mapbox Geocoding across query variants
  if (MAPBOX_TOKEN) {
    for (const qVar of queryVariants) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          qVar
        )}.json?country=za&types=address,poi,neighborhood,locality,place&autocomplete=true&fuzzyMatch=true&proximity=${lng},${lat}&limit=8&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(endpoint, { next: { revalidate: 30 } });
        if (res.ok) {
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

              addPlace({
                id: `mbx-${feat.id}-${houseNo || ''}`,
                name: primaryName,
                display_name: displayName,
                lat: feat.center[1],
                lon: feat.center[0],
                houseNumber: houseNo,
                street,
                suburb,
                city,
                buildingName,
                category,
              });
            });
          }
        }
      } catch (err: any) {
        console.warn('[Geocode API] Mapbox lookup warning:', err?.message);
      }
      if (results.length >= 8) break;
    }
  }

  // 2.2 Try Photon API (OpenStreetMap-based search, highly reliable for South African addresses)
  if (results.length < 8) {
    for (const qVar of queryVariants) {
      try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
          qVar
        )}&lat=${lat}&lon=${lng}&limit=8`;
        const pRes = await fetch(photonUrl, { next: { revalidate: 30 } });
        if (pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData.features)) {
            pData.features.forEach((feat: any) => {
              const props = feat.properties || {};
              const coords = feat.geometry?.coordinates;
              if (!coords || coords.length < 2) return;

              // Filter to South Africa if country code exists
              if (props.countrycode && props.countrycode.toUpperCase() !== 'ZA') return;

              const houseNo = props.housenumber || targetHouseNo || undefined;
              const street = props.street || undefined;
              const suburb = props.district || props.suburb || undefined;
              const city = props.city || props.town || props.state || 'Kimberley';
              const buildingName = props.name && (!street || props.name !== street) ? props.name : undefined;

              const streetWithNumber = [houseNo, street].filter(Boolean).join(' ').trim();
              let primaryName = buildingName || streetWithNumber || props.name || qVar;
              if (buildingName && streetWithNumber) {
                primaryName = `${buildingName} (${streetWithNumber})`;
              } else if (houseNo && street && !primaryName.startsWith(houseNo)) {
                primaryName = `${houseNo} ${street}`;
              }

              const contextParts = [suburb, city, props.state, props.postcode].filter(Boolean);
              const displayName = `${primaryName}, ${contextParts.join(', ')}`;

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
              });
            });
          }
        }
      } catch (err: any) {
        console.warn('[Geocode API] Photon lookup warning:', err?.message);
      }
      if (results.length >= 8) break;
    }
  }

  // 2.3 Try OpenStreetMap Nominatim with official User-Agent if results are still sparse
  if (results.length < 4) {
    try {
      const nomUrl = targetStreet
        ? `https://nominatim.openstreetmap.org/search?format=jsonv2&street=${encodeURIComponent(
            targetStreet
          )}&city=Kimberley&countrycodes=za&addressdetails=1&limit=6`
        : `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
            q
          )}&countrycodes=za&addressdetails=1&namedetails=1&extratags=1&limit=6`;

      const nomRes = await fetch(nomUrl, {
        headers: {
          'User-Agent': 'SoloRides/1.0 (https://solo-rides.co.za; contact@solorides.co.za)',
          Accept: 'application/json',
        },
        next: { revalidate: 30 },
      });
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData)) {
          nomData.forEach((item: any) => {
            const addr = item.address || {};
            const houseNo = addr.house_number || targetHouseNo || undefined;
            const street = addr.road || addr.pedestrian || addr.street || undefined;
            const suburb = addr.suburb || addr.neighbourhood || addr.quarter || undefined;
            const city = addr.city || addr.town || addr.municipality || 'Kimberley';
            const buildingName = item.name && (!street || item.name !== street) ? item.name : undefined;

            const streetWithNumber = [houseNo, street].filter(Boolean).join(' ').trim();
            let primaryName = buildingName || streetWithNumber || (item.display_name || '').split(',')[0];
            if (houseNo && street && !primaryName.startsWith(houseNo)) {
              primaryName = `${houseNo} ${street}`;
            }

            addPlace({
              id: `nom-${item.place_id || `${item.lat}-${item.lon}`}-${houseNo || ''}`,
              name: primaryName,
              display_name: item.display_name ? `${primaryName}, ${item.display_name}` : primaryName,
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
              houseNumber: houseNo,
              street,
              suburb,
              city,
              buildingName,
              category: buildingName ? 'building' : streetWithNumber ? 'address' : 'area',
            });
          });
        }
      }
    } catch (err: any) {
      console.warn('[Geocode API] Nominatim lookup warning:', err?.message);
    }
  }

  // Sort results by relevance: exact house number and street matches first
  if (targetHouseNo) {
    results.sort((a, b) => {
      const aMatchesHouse = a.houseNumber && a.houseNumber.toLowerCase() === targetHouseNo.toLowerCase();
      const bMatchesHouse = b.houseNumber && b.houseNumber.toLowerCase() === targetHouseNo.toLowerCase();
      if (aMatchesHouse && !bMatchesHouse) return -1;
      if (!aMatchesHouse && bMatchesHouse) return 1;
      return 0;
    });
  }

  return NextResponse.json({
    success: true,
    places: results.slice(0, 40),
  });
}
