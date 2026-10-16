import { calculateDistanceKm } from './geo.ts';

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

export const KIMBERLEY_POPULAR_PLACES: SearchResultPlace[] = [
  {
    id: 'poi-diamond-pavilion',
    name: 'Diamond Pavilion Mall',
    display_name: 'Diamond Pavilion Mall, Memorial Road, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7562,
    lon: 24.7645,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    buildingName: 'Diamond Pavilion Mall',
    category: 'building',
  },
  {
    id: 'poi-north-cape-mall',
    name: 'North Cape Mall',
    display_name: 'North Cape Mall, Memorial Road, Royldene, Kimberley, Northern Cape, 8301',
    lat: -28.7618,
    lon: 24.7621,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    buildingName: 'North Cape Mall',
    category: 'building',
  },
  {
    id: 'poi-big-hole',
    name: 'The Big Hole & Mine Museum',
    display_name: 'The Big Hole & Kimberley Mine Museum, Tucker Street, Kimberley, Northern Cape, 8301',
    lat: -28.7383,
    lon: 24.7578,
    street: 'Tucker Street',
    suburb: 'West End',
    city: 'Kimberley',
    buildingName: 'The Big Hole',
    category: 'poi',
  },
  {
    id: 'poi-spu-central',
    name: 'Sol Plaatje University (SPU)',
    display_name: 'Sol Plaatje University (Central Campus), Chapel Street / Luka Jantjie Street, Kimberley, Northern Cape, 8301',
    lat: -28.7428,
    lon: 24.7661,
    street: 'Chapel Street',
    suburb: 'Central',
    city: 'Kimberley',
    buildingName: 'Sol Plaatje University',
    category: 'building',
  },
  {
    id: 'poi-kimberley-hospital',
    name: 'Robert Mangaliso Sobukwe Hospital',
    display_name: 'Robert Mangaliso Sobukwe Hospital (Kimberley Hospital), Du Toitspan Road, Kimberley, Northern Cape, 8301',
    lat: -28.7408,
    lon: 24.7665,
    street: 'Du Toitspan Road',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    buildingName: 'Kimberley Hospital',
    category: 'building',
  },
  {
    id: 'poi-kimberley-airport',
    name: 'Kimberley Airport (KIM)',
    display_name: 'Kimberley Airport (KIM), Diskobolos Road, Kimberley, Northern Cape, 8301',
    lat: -28.8028,
    lon: 24.7656,
    street: 'Diskobolos Road',
    suburb: 'Kimberley Airport',
    city: 'Kimberley',
    buildingName: 'Kimberley Airport',
    category: 'poi',
  },
  {
    id: 'poi-gariep-mediclinic',
    name: 'Mediclinic Gariep',
    display_name: 'Mediclinic Gariep, MacDougall Street, El Toro Park, Kimberley, Northern Cape, 8301',
    lat: -28.7605,
    lon: 24.7601,
    street: 'MacDougall Street',
    suburb: 'El Toro Park',
    city: 'Kimberley',
    buildingName: 'Mediclinic Gariep',
    category: 'building',
  },
  {
    id: 'poi-mcgregor-museum',
    name: 'McGregor Museum',
    display_name: 'McGregor Museum, Atlas Street, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7564,
    lon: 24.7725,
    street: 'Atlas Street',
    suburb: 'Belgravia',
    city: 'Kimberley',
    buildingName: 'McGregor Museum',
    category: 'poi',
  },
  {
    id: 'poi-new-park-centre',
    name: 'New Park Shopping Centre',
    display_name: 'New Park Shopping Centre, Bultfontein Road, New Park, Kimberley, Northern Cape, 8301',
    lat: -28.7501,
    lon: 24.7615,
    street: 'Bultfontein Road',
    suburb: 'New Park',
    city: 'Kimberley',
    buildingName: 'New Park Shopping Centre',
    category: 'building',
  },
  {
    id: 'poi-lenmed-royal',
    name: 'Lenmed Royal Hospital',
    display_name: 'Lenmed Royal Hospital and Heart Centre, Lennox Street, Kimberley, Northern Cape, 8301',
    lat: -28.7441,
    lon: 24.7672,
    street: 'Lennox Street',
    suburb: 'Central',
    city: 'Kimberley',
    buildingName: 'Lenmed Royal Hospital',
    category: 'building',
  },
  {
    id: 'street-du-toitspan',
    name: 'Du Toitspan Road',
    display_name: 'Du Toitspan Road, Civic Centre / Central, Kimberley, Northern Cape, 8301',
    lat: -28.7415,
    lon: 24.7670,
    street: 'Du Toitspan Road',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-memorial-rd',
    name: 'Memorial Road',
    display_name: 'Memorial Road, Royldene / Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7610,
    lon: 24.7618,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-de-beers',
    name: 'De Beers Road',
    display_name: 'De Beers Road, Kimberley, Northern Cape, 8301',
    lat: -28.7360,
    lon: 24.7660,
    street: 'De Beers Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-barkly-rd',
    name: 'Barkly Road',
    display_name: 'Barkly Road, West End, Kimberley, Northern Cape, 8301',
    lat: -28.7290,
    lon: 24.7480,
    street: 'Barkly Road',
    suburb: 'West End',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-bultfontein-rd',
    name: 'Bultfontein Road',
    display_name: 'Bultfontein Road, New Park / Central, Kimberley, Northern Cape, 8301',
    lat: -28.7490,
    lon: 24.7620,
    street: 'Bultfontein Road',
    suburb: 'New Park',
    city: 'Kimberley',
    category: 'address',
  },
];

/**
 * Converts any string into Title Case (capitalizing the first letter of each word and unit numbers).
 * Ensures case-insensitive searches seamlessly match official map records.
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/\b([a-z])/gi, (char) => char.toUpperCase())
    .replace(/\b(\d+)([a-z])\b/gi, (_, num, letter) => `${num}${letter.toUpperCase()}`);
}

/**
 * Normalizes user queries for South African street names, handling:
 * 1. Lowercase vs Uppercase typing
 * 2. Compound Afrikaans/Dutch names (e.g. "dutoitspan" -> "Du Toitspan Road", "debeers" -> "De Beers Road")
 * 3. Abbreviations (e.g. "rd" -> "Road", "st" -> "Street", "ave" -> "Avenue")
 * 4. Common local landmarks (e.g. "spu" -> "Sol Plaatje University", "big hole" -> "The Big Hole")
 */
export function normalizeSearchQuery(raw: string): string {
  let q = raw.trim();

  const compoundReplacements: [RegExp, string][] = [
    [/\b(?:dutoitspan|du\s+toitspan|dutoits\s*pan|dutoit)(?:\s+(?:road|rd))?\b/gi, 'Du Toitspan Road'],
    [/\b(?:debeers|de\s+beers)(?:\s+(?:road|rd))?\b/gi, 'De Beers Road'],
    [/\b(?:vandermerwe|van\s+der\s+merwe)(?:\s+(?:street|st))?\b/gi, 'Van Der Merwe Street'],
    [/\b(?:vanderbijl|van\s+der\s+bijl)(?:\s+(?:street|st))?\b/gi, 'Van Der Bijl Street'],
    [/\b(?:vanzyl|van\s+zyl)(?:\s+(?:street|st))?\b/gi, 'Van Zyl Street'],
    [/\b(?:solplaatje|sol\s+plaatje)(?:\s+(?:drive|dr))?\b/gi, 'Sol Plaatje Drive'],
    [/\b(?:phakamilemabija|phakamile\s+mabija)(?:\s+(?:road|rd))?\b/gi, 'Phakamile Mabija Road'],
    [/\b(?:robertsobukwe|robert\s+sobukwe)(?:\s+(?:road|rd|hospital))?\b/gi, 'Robert Sobukwe Hospital'],
    [/\b(?:jansmuts|jan\s+smuts)(?:\s+(?:street|st|boulevard|blvd))?\b/gi, 'Jan Smuts Boulevard'],
    [/\b(?:bultfontein)(?:\s+(?:road|rd|street|st))?\b/gi, 'Bultfontein Road'],
    [/\b(?:carter|carters)(?:\s+(?:road|rd|street|st))?\b/gi, 'Carters Road'],
    [/\bspu\b/gi, 'Sol Plaatje University'],
    [/\bbig\s*hole\b/gi, 'The Big Hole, Kimberley'],
    [/\bdiamond\s*pavilion(?:\s*mall)?\b/gi, 'Diamond Pavilion Mall, Kimberley'],
    [/\bnorth\s*cape(?:\s*mall)?\b/gi, 'North Cape Mall, Kimberley'],
    [/\bkimberley\s*hospital\b/gi, 'Robert Mangaliso Sobukwe Hospital, Kimberley'],
  ];

  for (const [pattern, replacement] of compoundReplacements) {
    q = q.replace(pattern, replacement);
  }

  // Suffix expansions
  q = q
    .replace(/\brd\.?\b/gi, 'Road')
    .replace(/\bst\.?\b/gi, 'Street')
    .replace(/\bave?\.?\b/gi, 'Avenue')
    .replace(/\bcres?\.?\b/gi, 'Crescent')
    .replace(/\bdr\.?\b/gi, 'Drive')
    .replace(/\bcl\.?\b/gi, 'Close')
    .replace(/\bln\.?\b/gi, 'Lane')
    .replace(/\bpl\.?\b/gi, 'Place');

  return toTitleCase(q);
}

/**
 * Forward Geocoding: Search South African house numbers, building/complex names, street addresses, landmarks, and POIs
 * Completely case-insensitive with automatic title-case expansion, compound name resolution, and proximity sorting
 */
export async function searchPlaces(
  query: string,
  proximityCoords?: { lat: number; lng: number } | null
): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();
  const normalizedQuery = normalizeSearchQuery(cleanQuery);
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

  // 1. Instant match against local/popular Kimberley landmarks & major streets (0ms response)
  const lowerClean = cleanQuery.toLowerCase();
  const lowerNormalized = normalizedQuery.toLowerCase();
  const cleanNoSpace = lowerClean.replace(/[\s\-_]+/g, '');
  const normalizedNoSpace = lowerNormalized.replace(/[\s\-_]+/g, '');

  const cleanRemainder = (streetOrPlaceQuery || '').toLowerCase();
  const normalizedRemainder = normalizeSearchQuery(streetOrPlaceQuery || '').toLowerCase();
  const remainderNoSpace = cleanRemainder.replace(/[\s\-_]+/g, '');
  const normRemainderNoSpace = normalizedRemainder.replace(/[\s\-_]+/g, '');

  for (const popular of KIMBERLEY_POPULAR_PLACES) {
    const popularNameLower = popular.name.toLowerCase();
    const popularStreetLower = (popular.street || '').toLowerCase();
    const popularBuildingLower = (popular.buildingName || '').toLowerCase();
    const popularDisplayLower = popular.display_name.toLowerCase();

    const popularNameNoSpace = popularNameLower.replace(/[\s\-_]+/g, '');
    const popularStreetNoSpace = popularStreetLower.replace(/[\s\-_]+/g, '');
    const popularBuildingNoSpace = popularBuildingLower.replace(/[\s\-_]+/g, '');
    const popularDisplayNoSpace = popularDisplayLower.replace(/[\s\-_]+/g, '');

    const isMatch =
      popularNameLower.includes(lowerClean) ||
      popularStreetLower.includes(lowerClean) ||
      popularBuildingLower.includes(lowerClean) ||
      popularDisplayLower.includes(lowerClean) ||
      popularNameLower.includes(lowerNormalized) ||
      popularStreetLower.includes(lowerNormalized) ||
      popularDisplayLower.includes(lowerNormalized) ||
      popularNameLower.includes(cleanRemainder) ||
      popularStreetLower.includes(cleanRemainder) ||
      popularBuildingLower.includes(cleanRemainder) ||
      popularDisplayLower.includes(cleanRemainder) ||
      popularNameLower.includes(normalizedRemainder) ||
      popularStreetLower.includes(normalizedRemainder) ||
      popularDisplayLower.includes(normalizedRemainder) ||
      (cleanNoSpace.length >= 3 && (
        popularNameNoSpace.includes(cleanNoSpace) ||
        popularStreetNoSpace.includes(cleanNoSpace) ||
        popularBuildingNoSpace.includes(cleanNoSpace) ||
        popularDisplayNoSpace.includes(cleanNoSpace)
      )) ||
      (normalizedNoSpace.length >= 3 && (
        popularNameNoSpace.includes(normalizedNoSpace) ||
        popularStreetNoSpace.includes(normalizedNoSpace) ||
        popularDisplayNoSpace.includes(normalizedNoSpace)
      )) ||
      (remainderNoSpace.length >= 3 && (
        popularNameNoSpace.includes(remainderNoSpace) ||
        popularStreetNoSpace.includes(remainderNoSpace) ||
        popularBuildingNoSpace.includes(remainderNoSpace) ||
        popularDisplayNoSpace.includes(remainderNoSpace)
      )) ||
      (normRemainderNoSpace.length >= 3 && (
        popularNameNoSpace.includes(normRemainderNoSpace) ||
        popularStreetNoSpace.includes(normRemainderNoSpace) ||
        popularDisplayNoSpace.includes(normRemainderNoSpace)
      ));

    if (isMatch) {
      const matchWithHouse = parsedHouseNo
        ? {
            ...popular,
            id: `${popular.id}-${parsedHouseNo}`,
            name: `${parsedHouseNo} ${popular.name}`,
            display_name: `${parsedHouseNo} ${popular.display_name}`,
            houseNumber: parsedHouseNo,
          }
        : popular;
      addUniqueResult(matchWithHouse);
    }
  }

  // 2. Query Mapbox Geocoding with normalized Title Case and original variants
  if (MAPBOX_TOKEN) {
    const queryVariants = Array.from(new Set([normalizedQuery, cleanQuery])).filter(Boolean);

    for (const qVar of queryVariants) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          qVar
        )}.json?country=za&autocomplete=true&fuzzyMatch=true&proximity=${prox.lng},${prox.lat}&limit=8&access_token=${MAPBOX_TOKEN}`;
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
        console.warn('Mapbox geocoding error:', err);
      }
      if (combinedResults.length >= 6) break;
    }
  }

  // 3. Fallback: Query OpenStreetMap Nominatim with Title Case & full address details
  try {
    const viewbox = `${prox.lng - 0.4},${prox.lat + 0.4},${prox.lng + 0.4},${prox.lat - 0.4}`;
    const nominatimQueries = Array.from(new Set([normalizedQuery, cleanQuery]));

    for (const nomQuery of nominatimQueries) {
      if (combinedResults.length >= 6) break;
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        nomQuery
      )}&countrycodes=za&addressdetails=1&namedetails=1&extratags=1&dedupe=0&viewbox=${viewbox}&bounded=0&limit=6`;
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
    }

    // 4. House number fallback: search street remainder if exact house node wasn't in DB
    if (parsedHouseNo && streetOrPlaceQuery.length >= 3 && combinedResults.length < 4) {
      const streetNomQuery = normalizeSearchQuery(streetOrPlaceQuery);
      const streetUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        streetNomQuery
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

  // 5. Prioritize local results: sort by distance from proximity point (Kimberley/current GPS)
  combinedResults.sort((a, b) => {
    const distA = calculateDistanceKm(prox.lat, prox.lng, a.lat, a.lon);
    const distB = calculateDistanceKm(prox.lat, prox.lng, b.lat, b.lon);
    return distA - distB;
  });

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
