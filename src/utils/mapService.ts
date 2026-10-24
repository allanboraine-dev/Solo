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

export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  '';

// Default proximity bias: Kimberley CBD, Northern Cape (24.7623, -28.7282)
const DEFAULT_PROXIMITY = { lat: -28.7282, lng: 24.7623 };

/**
 * Robust fetch with timeout to prevent hanging network calls on mobile or slow networks
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2500): Promise<Response | null> {
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
 * Extracts a leading or trailing house/unit/stand number from a user query if present.
 * Examples:
 *  - "14 Niobe Street" -> { houseNumber: "14", remainder: "Niobe Street" }
 *  - "14B Memorial Road" -> { houseNumber: "14B", remainder: "Memorial Road" }
 *  - "No. 22 Barkley Rd" -> { houseNumber: "22", remainder: "Barkley Rd" }
 *  - "Stand 104 Galeshewe" -> { houseNumber: "104", remainder: "Galeshewe" }
 *  - "Memorial Road 14" -> { houseNumber: "14", remainder: "Memorial Road" }
 */
export function parseHouseNumberFromQuery(query: string): {
  houseNumber?: string;
  remainder: string;
} {
  const trimmed = (query || '').trim();
  if (!trimmed) return { remainder: '' };

  // Check leading house number: "14 Niobe Street", "No. 22 Barkley Rd", "#14 Memorial", "12, Carrington Road", "Stand 104"
  const leadingMatch = trimmed.match(
    /^(?:no\.?\s*|house\s*|erf\s*|stand\s*|unit\s*|flat\s*|apt\s*|#\s*)?(\d+[a-zA-Z]?|\d+[\w\/-]*)\s*[,]?\s+(.{2,})$/i
  );
  if (leadingMatch) {
    return {
      houseNumber: leadingMatch[1],
      remainder: leadingMatch[2].trim(),
    };
  }

  // Check trailing house number: "Niobe Street 14", "Memorial Road No 22", "Carrington Road, 12"
  const trailingMatch = trimmed.match(
    /^(.{2,})\s*[,]?\s+(?:no\.?\s*|house\s*|erf\s*|stand\s*|unit\s*|flat\s*|apt\s*|#\s*)?(\d+[a-zA-Z]?|\d+[\w\/-]*)$/i
  );
  if (trailingMatch) {
    return {
      houseNumber: trailingMatch[2],
      remainder: trailingMatch[1].trim(),
    };
  }

  // Standalone house number (e.g. "14", "22B", "#108")
  const standaloneMatch = trimmed.match(
    /^(?:no\.?\s*|house\s*|erf\s*|stand\s*|unit\s*|flat\s*|apt\s*|#\s*)?(\d+[a-zA-Z]?|\d+[\w\/-]*)$/i
  );
  if (standaloneMatch) {
    return {
      houseNumber: standaloneMatch[1],
      remainder: '',
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
    'Kimberley';

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

  const isCandidateStreet =
    buildingCandidate && /\b(street|road|avenue|ave|crescent|drive|dr|way|lane|place|boulevard|blvd|str)\b/i.test(buildingCandidate);
  if (isCandidateStreet && !street) {
    street = buildingCandidate;
  }

  const buildingName =
    buildingCandidate && !isCandidateStreet && (!street || buildingCandidate.toLowerCase() !== street.toLowerCase())
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
    city: city || 'Kimberley',
    buildingName,
    category,
  };
}

/**
 * Formats a Photon (OpenStreetMap) feature into a detailed SearchResultPlace
 */
function formatPhotonFeature(feat: any, userHouseNumber?: string): SearchResultPlace {
  const props = feat.properties || {};
  const coords = feat.geometry?.coordinates || [0, 0];
  const houseNumber = props.housenumber || userHouseNumber || undefined;
  const isPropStreet =
    props.name && /\b(street|road|avenue|ave|crescent|drive|dr|way|lane|place|boulevard|blvd|str)\b/i.test(props.name);
  const street = props.street || (isPropStreet ? props.name : undefined);
  const suburb = props.district || props.suburb || undefined;
  const city = props.city || props.town || props.state || 'Kimberley';
  const buildingName = props.name && !isPropStreet && (!street || props.name !== street) ? props.name : undefined;

  const streetWithNumber = [houseNumber, street].filter(Boolean).join(' ').trim();
  let primaryName = buildingName || streetWithNumber || props.name || '';
  if (buildingName && streetWithNumber) {
    primaryName = `${buildingName} (${streetWithNumber})`;
  }

  const contextParts = [suburb, city, props.state, props.postcode].filter(Boolean);
  const displayName = `${primaryName}, ${contextParts.join(', ')}`;

  return {
    id: `pho-${props.osm_id || `${coords[1]}-${coords[0]}`}-${houseNumber || ''}`,
    name: primaryName,
    display_name: displayName,
    lat: coords[1],
    lon: coords[0],
    houseNumber,
    street,
    suburb,
    city,
    buildingName,
    category: buildingName ? 'building' : streetWithNumber ? 'address' : 'area',
  };
}

export const KIMBERLEY_POPULAR_PLACES: SearchResultPlace[] = [
  // --- Malls & Shopping Centers ---
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
    id: 'poi-indian-centre',
    name: 'Indian Centre / Taxi Rank',
    display_name: 'Indian Centre, Phakamile Mabija Road, Kimberley CBD, Northern Cape, 8301',
    lat: -28.7392,
    lon: 24.7681,
    street: 'Phakamile Mabija Road',
    suburb: 'Central',
    city: 'Kimberley',
    buildingName: 'Indian Centre',
    category: 'building',
  },
  {
    id: 'poi-royldene-spar',
    name: 'Royldene Spar & Centre',
    display_name: 'Royldene Shopping Centre, Memorial Road, Royldene, Kimberley, Northern Cape, 8301',
    lat: -28.7645,
    lon: 24.7602,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-hadison-park-spar',
    name: 'Hadison Park Spar',
    display_name: 'Hadison Park Spar, Drakensberg Avenue, Hadison Park, Kimberley, Northern Cape, 8301',
    lat: -28.7698,
    lon: 24.7495,
    street: 'Drakensberg Avenue',
    suburb: 'Hadison Park',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-monument-spar',
    name: 'Monument Spar',
    display_name: 'Monument Spar, Memorial Road, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7582,
    lon: 24.7631,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-checkers-new-park',
    name: 'Checkers New Park',
    display_name: 'Checkers, New Park Centre, Bultfontein Road, Kimberley, Northern Cape, 8301',
    lat: -28.7505,
    lon: 24.7618,
    street: 'Bultfontein Road',
    suburb: 'New Park',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-checkers-diamond-pavilion',
    name: 'Checkers Diamond Pavilion',
    display_name: 'Checkers Hyper, Diamond Pavilion Mall, Memorial Road, Kimberley, 8301',
    lat: -28.7565,
    lon: 24.7642,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-shoprite-cbd',
    name: 'Shoprite Kimberley CBD',
    display_name: 'Shoprite, Chapel Street / Jones Street, Kimberley CBD, Northern Cape, 8301',
    lat: -28.7419,
    lon: 24.7689,
    street: 'Chapel Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-shoprite-galeshewe',
    name: 'Shoprite Galeshewe Plaza',
    display_name: 'Shoprite Galeshewe, Nobengula Extension, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7185,
    lon: 24.7291,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-woolworths-north-cape',
    name: 'Woolworths North Cape Mall',
    display_name: 'Woolworths, North Cape Mall, Memorial Road, Royldene, Kimberley, 8301',
    lat: -28.7615,
    lon: 24.7625,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-game-diamond-pavilion',
    name: 'Game Diamond Pavilion',
    display_name: 'Game Stores, Diamond Pavilion Mall, Memorial Road, Kimberley, 8301',
    lat: -28.756,
    lon: 24.7648,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-food-lovers-kimberley',
    name: "Food Lover's Market Kimberley",
    display_name: "Food Lover's Market, Memorial Road, Royldene, Kimberley, 8301",
    lat: -28.7622,
    lon: 24.7618,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-choppies-galeshewe',
    name: 'Choppies Supermarket Galeshewe',
    display_name: 'Choppies Supermarket, Nobengula Extension, Galeshewe, Kimberley, 8345',
    lat: -28.7198,
    lon: 24.7265,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-phakamile-mabija-plaza',
    name: 'Phakamile Mabija Plaza',
    display_name: 'Phakamile Mabija Plaza, Phakamile Mabija Road, Galeshewe, Kimberley, 8345',
    lat: -28.7145,
    lon: 24.7328,
    street: 'Phakamile Mabija Road',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kimberley-square',
    name: 'Kimberley Square Shopping Centre',
    display_name: 'Kimberley Square, Chapel Street & Jones Street, CBD, Kimberley, 8301',
    lat: -28.7415,
    lon: 24.7678,
    street: 'Chapel Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-virgin-active-kimberley',
    name: 'Virgin Active Health Club Kimberley',
    display_name: 'Virgin Active, Duvenhage Road, Royldene, Kimberley, Northern Cape, 8301',
    lat: -28.7635,
    lon: 24.7592,
    street: 'Duvenhage Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-planet-fitness-kimberley',
    name: 'Planet Fitness JustGym Kimberley',
    display_name: 'Planet Fitness, North Cape Mall, Memorial Road, Royldene, Kimberley, 8301',
    lat: -28.7608,
    lon: 24.7628,
    street: 'Memorial Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },

  // --- Hospitals & Medical ---
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
    id: 'poi-lenmed-royal',
    name: 'Lenmed Royal Hospital and Heart Centre',
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
    id: 'poi-west-end-hospital',
    name: 'West End Specialised Hospital',
    display_name: 'West End Hospital, Barkly Road, West End, Kimberley, Northern Cape, 8301',
    lat: -28.7245,
    lon: 24.7412,
    street: 'Barkly Road',
    suburb: 'West End',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-galeshewe-day-hospital',
    name: 'Galeshewe Day Hospital',
    display_name: 'Galeshewe Day Hospital, Nobengula Extension, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7198,
    lon: 24.7256,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-beaconsfield-clinic',
    name: 'Beaconsfield Health Clinic',
    display_name: 'Beaconsfield Community Clinic, Green Street, Beaconsfield, Kimberley, 8301',
    lat: -28.7682,
    lon: 24.7718,
    street: 'Green Street',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'building',
  },

  // --- Universities & Schools ---
  {
    id: 'poi-spu-central',
    name: 'Sol Plaatje University (SPU Central Campus)',
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
    id: 'poi-spu-south',
    name: 'Sol Plaatje University (SPU South Campus)',
    display_name: 'Sol Plaatje University (South Campus), Scanlan Street, Kimberley, Northern Cape, 8301',
    lat: -28.7472,
    lon: 24.7648,
    street: 'Scanlan Street',
    suburb: 'New Park',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-spu-north',
    name: 'Sol Plaatje University (SPU North Campus)',
    display_name: 'Sol Plaatje University (North Campus), Bultfontein Road, Kimberley, Northern Cape, 8301',
    lat: -28.7395,
    lon: 24.7634,
    street: 'Bultfontein Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-tvet-moremogolo',
    name: 'Northern Cape TVET College (Moremogolo Campus)',
    display_name: 'Northern Cape Urban TVET College, Phakamile Mabija Road, Galeshewe, Kimberley, 8345',
    lat: -28.7152,
    lon: 24.7315,
    street: 'Phakamile Mabija Road',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kboys-high',
    name: 'Kimberley Boys High School',
    display_name: 'Kimberley Boys High School, Dalham Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7512,
    lon: 24.7735,
    street: 'Dalham Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kgirls-high',
    name: 'Kimberley Girls High School',
    display_name: 'Kimberley Girls High School, Elsmere Road, Belgravia, Kimberley, 8301',
    lat: -28.7495,
    lon: 24.7745,
    street: 'Elsmere Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-nc-high',
    name: 'Northern Cape High School',
    display_name: 'Northern Cape High School, Memorial Road, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7548,
    lon: 24.7652,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-diamantveld-high',
    name: 'Hoërskool Diamantveld',
    display_name: 'Hoërskool Diamantveld, Voortrekker Street, Monument Heights, Kimberley, 8301',
    lat: -28.7538,
    lon: 24.7668,
    street: 'Voortrekker Street',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-cbc-st-patricks',
    name: "St Patrick's CBC Kimberley",
    display_name: "St Patrick's Christian Brothers' College, Du Toitspan Road, Kimberley, 8301",
    lat: -28.7488,
    lon: 24.7695,
    street: 'Du Toitspan Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-noord-kaap-high',
    name: 'Hoërskool Noord-Kaap',
    display_name: 'Hoërskool Noord-Kaap, Hayston Road, Royldene, Kimberley, 8301',
    lat: -28.7618,
    lon: 24.7575,
    street: 'Hayston Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-hts-kimberley',
    name: 'Technical High School Kimberley (HTS)',
    display_name: 'HTS Kimberley, Schmidtsdrift Road, Monument Heights, Kimberley, 8301',
    lat: -28.7508,
    lon: 24.7522,
    street: 'Schmidtsdrift Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-newton-primary',
    name: 'Newton Primary School',
    display_name: 'Newton Primary School, Halsbrouck Road, Newton, Kimberley, 8301',
    lat: -28.7515,
    lon: 24.7605,
    street: 'Halsbrouck Road',
    suburb: 'Newton',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kimberley-junior',
    name: 'Kimberley Junior School',
    display_name: 'Kimberley Junior School, Lennox Street, Belgravia, Kimberley, 8301',
    lat: -28.7468,
    lon: 24.7702,
    street: 'Lennox Street',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-st-boniface-high',
    name: 'St Boniface High School',
    display_name: 'St Boniface High School, Tshwene Street, Galeshewe, Kimberley, 8345',
    lat: -28.7245,
    lon: 24.7242,
    street: 'Tshwene Street',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-beacon-primary',
    name: 'Beacon Primary School',
    display_name: 'Beacon Primary School, Cassandra, Kimberley, 8301',
    lat: -28.7592,
    lon: 24.7678,
    suburb: 'Cassandra',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-eureka-primary',
    name: 'Eureka Primary School',
    display_name: 'Eureka Primary School, Memorial Road, Monument Heights, Kimberley, 8301',
    lat: -28.7578,
    lon: 24.7635,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },

  // --- Transport Hubs ---
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
    id: 'poi-kimberley-station',
    name: 'Kimberley Railway Station',
    display_name: 'Kimberley Train Station, Florence Road / Transvaal Road, Kimberley CBD, 8301',
    lat: -28.7342,
    lon: 24.7682,
    street: 'Florence Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'poi',
  },
  {
    id: 'poi-galeshewe-taxi-rank',
    name: 'Galeshewe Taxi Rank',
    display_name: 'Galeshewe Taxi Rank, Nobengula Extension, Galeshewe, Kimberley, 8345',
    lat: -28.7188,
    lon: 24.7285,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'poi',
  },
  {
    id: 'poi-indian-centre-rank',
    name: 'Indian Centre Taxi Rank',
    display_name: 'Indian Centre Taxi Rank, Phakamile Mabija Road, Kimberley CBD, 8301',
    lat: -28.7390,
    lon: 24.7684,
    street: 'Phakamile Mabija Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'poi',
  },

  // --- Landmarks & Civic ---
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
    id: 'poi-william-humphreys',
    name: 'William Humphreys Art Gallery',
    display_name: 'William Humphreys Art Gallery, Cullinan Crescent, Civic Centre, Kimberley, Northern Cape, 8301',
    lat: -28.7421,
    lon: 24.7675,
    street: 'Cullinan Crescent',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    category: 'poi',
  },
  {
    id: 'poi-sol-plaatje-municipality',
    name: 'Sol Plaatje Local Municipality (Civic Centre)',
    display_name: 'Sol Plaatje Municipality, Bultfontein Road & Sol Plaatje Drive, Civic Centre, Kimberley, 8301',
    lat: -28.7412,
    lon: 24.7645,
    street: 'Bultfontein Road',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-nc-legislature',
    name: 'Northern Cape Provincial Legislature',
    display_name: 'Northern Cape Provincial Legislature, Nobengula Extension, Galeshewe, Kimberley, 8345',
    lat: -28.7212,
    lon: 24.7218,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-mittah-seperepere',
    name: 'Mittah Seperepere Convention Centre',
    display_name: 'Mittah Seperepere Convention Centre, West Circular Road, Kimberley, Northern Cape, 8301',
    lat: -28.7398,
    lon: 24.7592,
    street: 'West Circular Road',
    suburb: 'West End',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-flamingo-casino',
    name: 'Flamingo Casino & Entertainment Centre',
    display_name: 'Flamingo Casino, Kimberley-Boshof Road (N12), Kimberley, Northern Cape, 8301',
    lat: -28.6945,
    lon: 24.7812,
    suburb: 'Kimberley North',
    city: 'Kimberley',
    category: 'poi',
  },
  {
    id: 'poi-the-solomon',
    name: 'The Solomon Edwardian Guest House',
    display_name: 'The Solomon Guest House, 1 Solomon Street, Herlear / Beaconsfield, Kimberley, 8301',
    lat: -28.7523,
    lon: 24.7791,
    street: 'Solomon Street',
    houseNumber: '1',
    suburb: 'Herlear',
    city: 'Kimberley',
    buildingName: 'The Solomon Edwardian Guest House',
    category: 'building',
  },
  {
    id: 'poi-protea-hotel',
    name: 'Protea Hotel by Marriott Kimberley',
    display_name: 'Protea Hotel Kimberley, West Circular Road, Kimberley Big Hole, 8301',
    lat: -28.7388,
    lon: 24.7572,
    street: 'West Circular Road',
    suburb: 'West End',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-halfway-house-hotel',
    name: 'The Halfway House Hotel',
    display_name: 'The Halfway House Hotel, 229 Du Toitspan Road, Belgravia, Kimberley, 8301',
    lat: -28.7528,
    lon: 24.7712,
    street: 'Du Toitspan Road',
    houseNumber: '229',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-horseshoe-motel',
    name: 'Horseshoe Motel & Conference Centre',
    display_name: 'Horseshoe Motel, Memorial Road, Monument Heights, Kimberley, 8301',
    lat: -28.7612,
    lon: 24.7615,
    street: 'Memorial Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-high-court',
    name: 'Northern Cape High Court',
    display_name: 'High Court of South Africa Northern Cape Division, Sol Plaatje Drive, Kimberley, 8301',
    lat: -28.7408,
    lon: 24.7642,
    street: 'Sol Plaatje Drive',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-home-affairs',
    name: 'Department of Home Affairs (Kimberley)',
    display_name: 'Department of Home Affairs, Old Post Office, Market Square, Kimberley CBD, 8301',
    lat: -28.7425,
    lon: 24.7692,
    street: 'Market Square',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-saps-kimberley',
    name: 'SAPS Kimberley Police Station (Central)',
    display_name: 'Kimberley Police Station, Transvaal Road & Phakamile Mabija St, Kimberley CBD, 8301',
    lat: -28.7385,
    lon: 24.7665,
    street: 'Transvaal Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-saps-galeshewe',
    name: 'SAPS Galeshewe Police Station',
    display_name: 'Galeshewe Police Station, Mampe Road, Galeshewe, Kimberley, 8345',
    lat: -28.7188,
    lon: 24.7312,
    street: 'Mampe Road',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kimberley-city-hall',
    name: 'Kimberley City Hall',
    display_name: 'Kimberley City Hall, Old Market Square, Kimberley CBD, 8301',
    lat: -28.7422,
    lon: 24.7688,
    street: 'Market Square',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'building',
  },
  {
    id: 'poi-kamfers-dam',
    name: 'Kamfers Dam (Lesser Flamingo Sanctuary)',
    display_name: 'Kamfers Dam Flamingo Viewpoint, N12 North, Kimberley, Northern Cape',
    lat: -28.6752,
    lon: 24.7615,
    suburb: 'Kimberley North',
    city: 'Kimberley',
    category: 'poi',
  },

  // --- Parks, Sports Grounds & Stadiums ---
  {
    id: 'poi-keeley-memorial-park',
    name: 'Keeley Memorial Park',
    display_name: "Keeley Memorial Park (St Patrick's CBC Grounds), Solomon Street, Klisserville / Herlear, Kimberley, 8301",
    lat: -28.7538,
    lon: 24.7802,
    street: 'Solomon Street',
    suburb: 'Herlear',
    city: 'Kimberley',
    buildingName: 'Keeley Memorial Park',
    category: 'poi',
  },
  {
    id: 'poi-keeley-park',
    name: 'Keeley Park',
    display_name: 'Keeley Park Sports Grounds, Solomon Street, Herlear / Beaconsfield, Kimberley, 8301',
    lat: -28.7538,
    lon: 24.7802,
    street: 'Solomon Street',
    suburb: 'Herlear',
    city: 'Kimberley',
    buildingName: 'Keeley Park',
    category: 'poi',
  },
  {
    id: 'poi-st-patricks-cbc-grounds',
    name: "St Patrick's CBC Sports Grounds",
    display_name: "St Patrick's CBC Sports Grounds (Keeley Park), Solomon Street, Herlear, Kimberley, 8301",
    lat: -28.7538,
    lon: 24.7802,
    street: 'Solomon Street',
    suburb: 'Herlear',
    city: 'Kimberley',
    buildingName: "St Patrick's CBC Sports Grounds",
    category: 'poi',
  },
  {
    id: 'poi-tafel-lager-park',
    name: 'Tafel Lager Park (Griqua Rugby Stadium)',
    display_name: 'Tafel Lager Park (Windhoek Draught Park), Barkly Road, De Beers, Kimberley, 8301',
    lat: -28.7328,
    lon: 24.7538,
    street: 'Barkly Road',
    suburb: 'De Beers',
    city: 'Kimberley',
    buildingName: 'Tafel Lager Park',
    category: 'poi',
  },
  {
    id: 'poi-diamond-oval',
    name: 'De Beers Diamond Oval',
    display_name: 'De Beers Diamond Oval (Kimberley Cricket Ground), Cassandra / Monument Heights, Kimberley, 8301',
    lat: -28.7471,
    lon: 24.7567,
    suburb: 'Monument Heights',
    city: 'Kimberley',
    buildingName: 'De Beers Diamond Oval',
    category: 'poi',
  },
  {
    id: 'poi-honoured-dead-memorial',
    name: 'Honoured Dead Memorial & Park',
    display_name: 'Honoured Dead Memorial, Memorial Road & Oliver Road, Kimberley, Northern Cape, 8301',
    lat: -28.7486,
    lon: 24.7648,
    street: 'Memorial Road',
    suburb: 'Memorial Heights',
    city: 'Kimberley',
    buildingName: 'Honoured Dead Memorial',
    category: 'poi',
  },
  {
    id: 'poi-oppenheimer-park',
    name: 'Oppenheimer Memorial Park & Diggers Fountain',
    display_name: 'Oppenheimer Memorial Park, Cullinan Crescent, Civic Centre, Kimberley, 8301',
    lat: -28.7424,
    lon: 24.7681,
    street: 'Cullinan Crescent',
    suburb: 'Civic Centre',
    city: 'Kimberley',
    buildingName: 'Oppenheimer Memorial Park',
    category: 'poi',
  },
  {
    id: 'poi-galeshewe-stadium',
    name: 'Galeshewe Stadium',
    display_name: 'Galeshewe Stadium, Hulana Street, Galeshewe, Kimberley, 8345',
    lat: -28.718,
    lon: 24.729,
    street: 'Hulana Street',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    buildingName: 'Galeshewe Stadium',
    category: 'poi',
  },
  {
    id: 'poi-karen-muir-pool',
    name: 'Karen Muir Olympic Swimming Pool',
    display_name: 'Karen Muir Swimming Pool, Park Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7441,
    lon: 24.7663,
    street: 'Park Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    buildingName: 'Karen Muir Olympic Swimming Pool',
    category: 'poi',
  },
  {
    id: 'poi-beaconsfield-sports-grounds',
    name: 'Beaconsfield Cricket Club & Sports Grounds',
    display_name: 'Beaconsfield Cricket Club & Sports Grounds, Central Road, Beaconsfield, Kimberley, 8301',
    lat: -28.7652,
    lon: 24.7745,
    street: 'Central Road',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    buildingName: 'Beaconsfield Sports Club',
    category: 'poi',
  },

  // --- Suburbs & Townships ---
  {
    id: 'suburb-galeshewe',
    name: 'Galeshewe',
    display_name: 'Galeshewe, Kimberley, Northern Cape, 8345, South Africa',
    lat: -28.7167,
    lon: 24.7267,
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-beaconsfield',
    name: 'Beaconsfield',
    display_name: 'Beaconsfield, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7667,
    lon: 24.7667,
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-belgravia',
    name: 'Belgravia',
    display_name: 'Belgravia, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7533,
    lon: 24.7733,
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-monument-heights',
    name: 'Monument Heights',
    display_name: 'Monument Heights, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7583,
    lon: 24.7650,
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-royldene',
    name: 'Royldene',
    display_name: 'Royldene, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7633,
    lon: 24.7600,
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-hadison-park',
    name: 'Hadison Park',
    display_name: 'Hadison Park, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7712,
    lon: 24.7485,
    suburb: 'Hadison Park',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-rhodesdene',
    name: 'Rhodesdene',
    display_name: 'Rhodesdene, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7567,
    lon: 24.7533,
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-carters-glen',
    name: 'Carters Glen',
    display_name: 'Carters Glen, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7600,
    lon: 24.7433,
    suburb: 'Carters Glen',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-west-end',
    name: 'West End',
    display_name: 'West End, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7333,
    lon: 24.7467,
    suburb: 'West End',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-new-park',
    name: 'New Park',
    display_name: 'New Park, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7483,
    lon: 24.7633,
    suburb: 'New Park',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-roodepan',
    name: 'Roodepan',
    display_name: 'Roodepan, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.6917,
    lon: 24.7333,
    suburb: 'Roodepan',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-greenpoint',
    name: 'Greenpoint',
    display_name: 'Greenpoint, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7833,
    lon: 24.7750,
    suburb: 'Greenpoint',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-platfontein',
    name: 'Platfontein',
    display_name: 'Platfontein, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.6833,
    lon: 24.6333,
    suburb: 'Platfontein',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-hillcrest',
    name: 'Hillcrest',
    display_name: 'Hillcrest, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7542,
    lon: 24.7421,
    suburb: 'Hillcrest',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-cassandra',
    name: 'Cassandra',
    display_name: 'Cassandra, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7750,
    lon: 24.7620,
    suburb: 'Cassandra',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-gemdene',
    name: 'Gemdene',
    display_name: 'Gemdene, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7305,
    lon: 24.7350,
    suburb: 'Gemdene',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-floors',
    name: 'Floors',
    display_name: 'Floors, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7250,
    lon: 24.7390,
    suburb: 'Floors',
    city: 'Kimberley',
    category: 'area',
  },
  {
    id: 'suburb-colville',
    name: 'Colville',
    display_name: 'Colville, Kimberley, Northern Cape, 8301, South Africa',
    lat: -28.7210,
    lon: 24.7340,
    suburb: 'Colville',
    city: 'Kimberley',
    category: 'area',
  },

  // --- Major Kimberley Streets ---
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
  {
    id: 'street-de-beers',
    name: 'De Beers Road',
    display_name: 'De Beers Road, Kimberley Central, Northern Cape, 8301',
    lat: -28.7360,
    lon: 24.7660,
    street: 'De Beers Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-transvaal-rd',
    name: 'Transvaal Road',
    display_name: 'Transvaal Road, Kimberley CBD, Northern Cape, 8301',
    lat: -28.7315,
    lon: 24.7625,
    street: 'Transvaal Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-oliver-rd',
    name: 'Oliver Road',
    display_name: 'Oliver Road, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7680,
    lon: 24.7675,
    street: 'Oliver Road',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-macdougall',
    name: 'MacDougall Street',
    display_name: 'MacDougall Street, El Toro Park / Monument Heights, Kimberley, 8301',
    lat: -28.7615,
    lon: 24.7620,
    street: 'MacDougall Street',
    suburb: 'El Toro Park',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-niobe',
    name: 'Niobe Street',
    display_name: 'Niobe Street, Beaconsfield, Kimberley, Northern Cape, 8301',
    lat: -28.7501,
    lon: 24.7882,
    street: 'Niobe Street',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-carters-rd',
    name: 'Carters Road',
    display_name: 'Carters Road, Rhodesdene / Carters Glen, Kimberley, 8301',
    lat: -28.7585,
    lon: 24.7475,
    street: 'Carters Road',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-chapel',
    name: 'Chapel Street',
    display_name: 'Chapel Street, Kimberley Central / CBD, Northern Cape, 8301',
    lat: -28.7430,
    lon: 24.7665,
    street: 'Chapel Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-phakamile-mabija',
    name: 'Phakamile Mabija Road',
    display_name: 'Phakamile Mabija Road (formerly Jones St), Kimberley CBD, 8301',
    lat: -28.7405,
    lon: 24.7695,
    street: 'Phakamile Mabija Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-nobengula',
    name: 'Nobengula Extension',
    display_name: 'Nobengula Extension, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7190,
    lon: 24.7270,
    street: 'Nobengula Extension',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-schmidtsdrift',
    name: 'Schmidtsdrift Road',
    display_name: 'Schmidtsdrift Road, Rhodesdene / Hillcrest, Kimberley, 8301',
    lat: -28.7520,
    lon: 24.7390,
    street: 'Schmidtsdrift Road',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-carrington',
    name: 'Carrington Road',
    display_name: 'Carrington Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7512,
    lon: 24.7725,
    street: 'Carrington Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-lennox',
    name: 'Lennox Street',
    display_name: 'Lennox Street, Central / Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7460,
    lon: 24.7690,
    street: 'Lennox Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-dalham',
    name: 'Dalham Road',
    display_name: 'Dalham Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7540,
    lon: 24.7710,
    street: 'Dalham Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-aristotle',
    name: 'Aristotle Avenue',
    display_name: 'Aristotle Avenue, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7590,
    lon: 24.7660,
    street: 'Aristotle Avenue',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-plato',
    name: 'Plato Avenue',
    display_name: 'Plato Avenue, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7605,
    lon: 24.7670,
    street: 'Plato Avenue',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-socrates',
    name: 'Socrates Avenue',
    display_name: 'Socrates Avenue, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7595,
    lon: 24.7680,
    street: 'Socrates Avenue',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-homer',
    name: 'Homer Avenue',
    display_name: 'Homer Avenue, Monument Heights, Kimberley, Northern Cape, 8301',
    lat: -28.7620,
    lon: 24.7690,
    street: 'Homer Avenue',
    suburb: 'Monument Heights',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-reservoir',
    name: 'Reservoir Road',
    display_name: 'Reservoir Road, Rhodesdene / Carters Glen, Kimberley, Northern Cape, 8301',
    lat: -28.7550,
    lon: 24.7450,
    street: 'Reservoir Road',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-hull',
    name: 'Hull Street',
    display_name: 'Hull Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7380,
    lon: 24.7740,
    street: 'Hull Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-george',
    name: 'George Street',
    display_name: 'George Street, Kimberley Central / Civic Centre, Northern Cape, 8301',
    lat: -28.7390,
    lon: 24.7670,
    street: 'George Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-bean',
    name: 'Bean Street',
    display_name: 'Bean Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7420,
    lon: 24.7640,
    street: 'Bean Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-roper',
    name: 'Roper Street',
    display_name: 'Roper Street, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7470,
    lon: 24.7680,
    street: 'Roper Street',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-park',
    name: 'Park Road',
    display_name: 'Park Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7485,
    lon: 24.7700,
    street: 'Park Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-egerton',
    name: 'Egerton Road',
    display_name: 'Egerton Road, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7530,
    lon: 24.7740,
    street: 'Egerton Road',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-milner',
    name: 'Milner Street',
    display_name: 'Milner Street, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7525,
    lon: 24.7750,
    street: 'Milner Street',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-scanlan',
    name: 'Scanlan Street',
    display_name: 'Scanlan Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7385,
    lon: 24.7620,
    street: 'Scanlan Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-stockdale',
    name: 'Stockdale Street',
    display_name: 'Stockdale Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7370,
    lon: 24.7645,
    street: 'Stockdale Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-crossman',
    name: 'Crossman Road',
    display_name: 'Crossman Road, Kimberley Central, Northern Cape, 8301',
    lat: -28.7395,
    lon: 24.7610,
    street: 'Crossman Road',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-pniel',
    name: 'Pniel Road',
    display_name: 'Pniel Road, West End / Central, Kimberley, Northern Cape, 8301',
    lat: -28.7330,
    lon: 24.7600,
    street: 'Pniel Road',
    suburb: 'West End',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-woodley',
    name: 'Woodley Street',
    display_name: 'Woodley Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7440,
    lon: 24.7660,
    street: 'Woodley Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-sydney',
    name: 'Sydney Street',
    display_name: 'Sydney Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7410,
    lon: 24.7630,
    street: 'Sydney Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-villiers',
    name: 'Villiers Street',
    display_name: 'Villiers Street, Belgravia, Kimberley, Northern Cape, 8301',
    lat: -28.7450,
    lon: 24.7685,
    street: 'Villiers Street',
    suburb: 'Belgravia',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-halkett',
    name: 'Halkett Road',
    display_name: 'Halkett Road, Rhodesdene, Kimberley, Northern Cape, 8301',
    lat: -28.7540,
    lon: 24.7550,
    street: 'Halkett Road',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-diamant',
    name: 'Diamant Street',
    display_name: 'Diamant Street, Rhodesdene, Kimberley, Northern Cape, 8301',
    lat: -28.7510,
    lon: 24.7500,
    street: 'Diamant Street',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-lawson',
    name: 'Lawson Street',
    display_name: 'Lawson Street, Rhodesdene, Kimberley, Northern Cape, 8301',
    lat: -28.7505,
    lon: 24.7530,
    street: 'Lawson Street',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-central-rd',
    name: 'Central Road',
    display_name: 'Central Road, Beaconsfield, Kimberley, Northern Cape, 8301',
    lat: -28.7650,
    lon: 24.7680,
    street: 'Central Road',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-green',
    name: 'Green Street',
    display_name: 'Green Street, Beaconsfield, Kimberley, Northern Cape, 8301',
    lat: -28.7680,
    lon: 24.7720,
    street: 'Green Street',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-main-rd',
    name: 'Main Road',
    display_name: 'Main Road, Beaconsfield, Kimberley, Northern Cape, 8301',
    lat: -28.7630,
    lon: 24.7690,
    street: 'Main Road',
    suburb: 'Beaconsfield',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-market',
    name: 'Market Street',
    display_name: 'Market Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7400,
    lon: 24.7650,
    street: 'Market Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-steve-biko',
    name: 'Steve Biko Road',
    display_name: 'Steve Biko Road, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7150,
    lon: 24.7230,
    street: 'Steve Biko Road',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-moshweshwe',
    name: 'Moshweshwe Street',
    display_name: 'Moshweshwe Street, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7220,
    lon: 24.7250,
    street: 'Moshweshwe Street',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-tshelanyane',
    name: 'Tshelanyane Street',
    display_name: 'Tshelanyane Street, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7180,
    lon: 24.7310,
    street: 'Tshelanyane Street',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-mapoch',
    name: 'Mapoch Street',
    display_name: 'Mapoch Street, Galeshewe, Kimberley, Northern Cape, 8345',
    lat: -28.7160,
    lon: 24.7290,
    street: 'Mapoch Street',
    suburb: 'Galeshewe',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-diskobolos',
    name: 'Diskobolos Road',
    display_name: 'Diskobolos Road, Diskobolos / Airport, Kimberley, 8301',
    lat: -28.7950,
    lon: 24.7660,
    street: 'Diskobolos Road',
    suburb: 'Diskobolos',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-long',
    name: 'Long Street',
    display_name: 'Long Street, Kimberley Central, Northern Cape, 8301',
    lat: -28.7445,
    lon: 24.7580,
    street: 'Long Street',
    suburb: 'Central',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-waterworks',
    name: 'Waterworks Road',
    display_name: 'Waterworks Road, Royldene, Kimberley, Northern Cape, 8301',
    lat: -28.7620,
    lon: 24.7580,
    street: 'Waterworks Road',
    suburb: 'Royldene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-rendlesham',
    name: 'Rendlesham Road',
    display_name: 'Rendlesham Road, Rhodesdene, Kimberley, Northern Cape, 8301',
    lat: -28.7560,
    lon: 24.7510,
    street: 'Rendlesham Road',
    suburb: 'Rhodesdene',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-jacobus-smit',
    name: 'Jacobus Smit Avenue',
    display_name: 'Jacobus Smit Avenue, Hadison Park, Kimberley, Northern Cape, 8301',
    lat: -28.7570,
    lon: 24.7420,
    street: 'Jacobus Smit Avenue',
    suburb: 'Hadison Park',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-silson',
    name: 'Silson Road',
    display_name: 'Silson Road, Hadison Park, Kimberley, Northern Cape, 8301',
    lat: -28.7590,
    lon: 24.7410,
    street: 'Silson Road',
    suburb: 'Hadison Park',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-roodepan-main',
    name: 'Roodepan Main Road',
    display_name: 'Roodepan Main Road, Roodepan, Kimberley, Northern Cape, 8301',
    lat: -28.6920,
    lon: 24.7310,
    street: 'Roodepan Main Road',
    suburb: 'Roodepan',
    city: 'Kimberley',
    category: 'address',
  },
  {
    id: 'street-eagle',
    name: 'Eagle Street',
    display_name: 'Eagle Street, Roodepan, Kimberley, Northern Cape, 8301',
    lat: -28.6900,
    lon: 24.7340,
    street: 'Eagle Street',
    suburb: 'Roodepan',
    city: 'Kimberley',
    category: 'address',
  },

  // --- Major National Metros (South Africa) ---
  {
    id: 'poi-sandton-city',
    name: 'Sandton City Mall',
    display_name: 'Sandton City, Rivonia Road, Sandhurst, Sandton, Gauteng, 2196',
    lat: -26.1076,
    lon: 28.0567,
    street: 'Rivonia Road',
    suburb: 'Sandton',
    city: 'Johannesburg',
    buildingName: 'Sandton City',
    category: 'building',
  },
  {
    id: 'poi-or-tambo',
    name: 'O.R. Tambo International Airport (JNB)',
    display_name: 'O.R. Tambo International Airport (JNB), Kempton Park, Gauteng, 1627',
    lat: -26.1367,
    lon: 28.2411,
    suburb: 'Kempton Park',
    city: 'Johannesburg',
    buildingName: 'O.R. Tambo Airport',
    category: 'poi',
  },
  {
    id: 'poi-cpt-airport',
    name: 'Cape Town International Airport (CPT)',
    display_name: 'Cape Town International Airport (CPT), Matroosfontein, Cape Town, 7490',
    lat: -33.9715,
    lon: 18.6021,
    suburb: 'Matroosfontein',
    city: 'Cape Town',
    buildingName: 'Cape Town Airport',
    category: 'poi',
  },
  {
    id: 'poi-va-waterfront',
    name: 'V&A Waterfront',
    display_name: 'V&A Waterfront, 19 Dock Road, Victoria & Alfred Waterfront, Cape Town, 8001',
    lat: -33.9036,
    lon: 18.4205,
    street: 'Dock Road',
    suburb: 'V&A Waterfront',
    city: 'Cape Town',
    buildingName: 'V&A Waterfront',
    category: 'building',
  },
];

/**
 * Converts any string into Title Case (capitalizing the first letter of each word and unit numbers).
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
  let q = (raw || '').trim();

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
 * Calculates Levenshtein distance for typo tolerance
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Computes a smart relevance score for matching places against user query.
 */
function scorePlaceRelevance(
  place: SearchResultPlace,
  queryLower: string,
  normalizedLower: string,
  userTokens: string[],
  parsedHouseNo?: string,
  streetRemainder?: string,
  prox?: { lat: number; lng: number }
): number {
  const pName = place.name.toLowerCase();
  const pStreet = (place.street || '').toLowerCase();
  const pSuburb = (place.suburb || '').toLowerCase();
  const pBuilding = (place.buildingName || '').toLowerCase();
  const pCity = (place.city || '').toLowerCase();

  let score = 0;

  // 1. Exact Match on name / building / street
  if (pName === queryLower || pBuilding === queryLower || pStreet === queryLower) {
    score += 350;
  } else if (pName === normalizedLower || pBuilding === normalizedLower) {
    score += 320;
  }

  // 2. Starts with query
  if (pName.startsWith(queryLower) || pBuilding.startsWith(queryLower)) {
    score += 200;
  } else if (pStreet.startsWith(queryLower)) {
    score += 180;
  } else if (pName.startsWith(normalizedLower)) {
    score += 160;
  }

  // 3. Word boundary prefix match (e.g. "pavilion" in "Diamond Pavilion")
  const words = `${pName} ${pStreet} ${pBuilding}`.split(/\s+/);
  for (const w of words) {
    if (w === queryLower) {
      score += 140;
      break;
    } else if (w.startsWith(queryLower)) {
      score += 100;
      break;
    }
  }

  // 4. Token Matching
  if (userTokens.length > 0) {
    let matchedTokenCount = 0;
    for (const token of userTokens) {
      if (token.length < 2) continue;
      const tokenInName = pName.includes(token);
      const tokenInBuilding = pBuilding.includes(token);
      const tokenInStreet = pStreet.includes(token);
      const tokenInSuburb = pSuburb.includes(token);
      const tokenInCity = pCity.includes(token);

      if (tokenInName || tokenInBuilding) {
        score += 60;
        matchedTokenCount++;
      } else if (tokenInStreet) {
        score += 45;
        matchedTokenCount++;
      } else if (tokenInSuburb) {
        score += 35;
        matchedTokenCount++;
      } else if (tokenInCity) {
        score += 25;
        matchedTokenCount++;
      }
    }

    if (matchedTokenCount === userTokens.length && userTokens.length > 1) {
      score += 100; // All tokens matched!
    }
  }

  // 5. House number match
  if (parsedHouseNo) {
    if (place.houseNumber && place.houseNumber.toLowerCase() === parsedHouseNo.toLowerCase()) {
      score += 200; // Direct house number match!
    }
    // If the query had a street and this place matches the street
    if (streetRemainder && streetRemainder.length >= 2) {
      const remLower = streetRemainder.toLowerCase();
      if (pStreet.includes(remLower) || pName.includes(remLower)) {
        score += 120;
      }
    }
  }

  // 6. Typo Tolerance / Fuzzy Match (for tokens >= 4 chars)
  if (score === 0 && queryLower.length >= 4) {
    for (const w of words) {
      if (w.length >= 4 && Math.abs(w.length - queryLower.length) <= 2) {
        const dist = levenshteinDistance(w, queryLower);
        if (dist === 1) {
          score += 120;
          break;
        } else if (dist === 2 && queryLower.length >= 5) {
          score += 70;
          break;
        }
      }
    }
  }

  // 7. Category Bonuses (only if query actually matched the place!)
  if (score > 0) {
    if (place.category === 'building') {
      score += 25;
    } else if (place.category === 'address') {
      score += 20;
    } else if (place.category === 'poi') {
      score += 20;
    }
  }

  // 8. Proximity Bonus (closer to Kimberley center or user's GPS coords)
  if (prox && score > 0) {
    const distKm = calculateDistanceKm(prox.lat, prox.lng, place.lat, place.lon);
    // Add small proximity weight (e.g. up to +20 for nearby places within Kimberley)
    score += Math.max(0, 20 - distKm);
  }

  return score;
}

/**
 * Instant local search against Kimberley popular places, streets, POIs, malls, and hospitals (0ms response).
 */
export function searchLocalPlaces(
  query: string,
  proximityCoords?: { lat: number; lng: number } | null,
  categoryFilter?: string
): SearchResultPlace[] {
  const prox = proximityCoords || DEFAULT_PROXIMITY;
  const cleanQuery = (query || '').trim();
  const normalizedQuery = normalizeSearchQuery(cleanQuery);
  const { houseNumber: parsedHouseNo, remainder: streetOrPlaceQuery } = parseHouseNumberFromQuery(cleanQuery);

  let pool = KIMBERLEY_POPULAR_PLACES;
  if (categoryFilter && categoryFilter !== 'all') {
    pool = pool.filter((p) => {
      const pName = p.name.toLowerCase();
      if (categoryFilter === 'streets') return p.category === 'address';
      if (categoryFilter === 'malls') {
        return (
          p.category === 'building' &&
          (pName.includes('mall') ||
            pName.includes('spar') ||
            pName.includes('centre') ||
            pName.includes('center') ||
            pName.includes('shoprite') ||
            pName.includes('checkers'))
        );
      }
      if (categoryFilter === 'hospitals') {
        return pName.includes('hospital') || pName.includes('clinic') || pName.includes('mediclinic');
      }
      if (categoryFilter === 'transport') {
        return (
          p.category === 'poi' ||
          pName.includes('taxi') ||
          pName.includes('airport') ||
          pName.includes('station') ||
          pName.includes('rank')
        );
      }
      if (categoryFilter === 'parks') {
        return (
          (p.category === 'poi' || p.category === 'building') &&
          (pName.includes('park') ||
            pName.includes('stadium') ||
            pName.includes('oval') ||
            pName.includes('ground') ||
            pName.includes('field') ||
            pName.includes('club') ||
            pName.includes('garden') ||
            pName.includes('pool'))
        );
      }
      if (categoryFilter === 'schools') {
        return (
          (p.category === 'building' || p.category === 'poi') &&
          (pName.includes('school') ||
            pName.includes('skool') ||
            pName.includes('college') ||
            pName.includes('high') ||
            pName.includes('primary') ||
            pName.includes('university') ||
            pName.includes('spu') ||
            pName.includes('campus') ||
            pName.includes('academy'))
        );
      }
      if (categoryFilter === 'suburbs') return p.category === 'area';
      return true;
    });
  }

  // If query is empty, return pool sorted by proximity
  if (!cleanQuery) {
    return [...pool].sort((a, b) => {
      const distA = calculateDistanceKm(prox.lat, prox.lng, a.lat, a.lon);
      const distB = calculateDistanceKm(prox.lat, prox.lng, b.lat, b.lon);
      return distA - distB;
    });
  }

  const results: SearchResultPlace[] = [];
  const seenKeys = new Set<string>();

  const addUnique = (place: SearchResultPlace) => {
    if (Number.isNaN(place.lat) || Number.isNaN(place.lon)) return;
    const dedupeKey = `${place.name.toLowerCase()}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      results.push(place);
    }
  };

  // 1. If user typed a standalone house number (e.g. "14"), suggest top Kimberley thoroughfares with that number
  if (parsedHouseNo && (!streetOrPlaceQuery || streetOrPlaceQuery.trim().length === 0)) {
    const streets = pool.filter((p) => p.category === 'address');
    for (const streetPlace of streets) {
      addUnique({
        ...streetPlace,
        id: `${streetPlace.id}-${parsedHouseNo}`,
        name: `${parsedHouseNo} ${streetPlace.name}`,
        display_name: `${parsedHouseNo} ${streetPlace.display_name}`,
        houseNumber: parsedHouseNo,
        street: streetPlace.street || streetPlace.name,
        category: 'address',
      });
    }
    return results;
  }

  const queryLower = cleanQuery.toLowerCase();
  const normalizedLower = normalizedQuery.toLowerCase();
  // Exclude common stop words from token matching
  const stopWords = new Set([
    'in', 'at', 'near', 'the', 'of', 'and', 'za', 'south', 'africa', 'street',
    'st', 'road', 'rd', 'avenue', 'ave', 'close', 'to', 'from', 'around', 'by',
    'opposite', 'corner', 'crn', 'next'
  ]);
  const userTokens = queryLower
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !stopWords.has(t));

  const scoredPlaces: { place: SearchResultPlace; score: number }[] = [];

  for (const popular of pool) {
    const score = scorePlaceRelevance(
      popular,
      queryLower,
      normalizedLower,
      userTokens,
      parsedHouseNo,
      streetOrPlaceQuery,
      prox
    );

    // Also handle single-letter matching: if query is a single letter (e.g. 'm'), match if name or street starts with 'm'
    const singleLetterMatch = cleanQuery.length === 1 && (
      popular.name.toLowerCase().startsWith(queryLower) ||
      (popular.street && popular.street.toLowerCase().startsWith(queryLower)) ||
      (popular.buildingName && popular.buildingName.toLowerCase().startsWith(queryLower))
    );

    if (score > 0 || singleLetterMatch) {
      let finalPlace = popular;
      if (parsedHouseNo && popular.category === 'address') {
        finalPlace = {
          ...popular,
          id: `${popular.id}-${parsedHouseNo}`,
          name: `${parsedHouseNo} ${popular.name}`,
          display_name: `${parsedHouseNo} ${popular.display_name}`,
          houseNumber: parsedHouseNo,
          street: popular.street || popular.name,
          category: 'address' as const,
        };
      } else if (parsedHouseNo) {
        finalPlace = {
          ...popular,
          id: `${popular.id}-${parsedHouseNo}`,
          name: `${parsedHouseNo} ${popular.name}`,
          display_name: `${parsedHouseNo} ${popular.display_name}`,
          houseNumber: parsedHouseNo,
        };
      }

      scoredPlaces.push({
        place: finalPlace,
        score: score + (singleLetterMatch ? 50 : 0),
      });
    }
  }

  // Sort strictly by relevance score descending
  scoredPlaces.sort((a, b) => b.score - a.score);

  for (const item of scoredPlaces) {
    addUnique(item.place);
  }

  return results;
}

/**
 * Forward Geocoding: Search South African house numbers, building/complex names, street addresses, landmarks, and POIs
 * Completely case-insensitive with automatic title-case expansion, compound name resolution, and proximity sorting
 */
export async function searchPlaces(
  query: string,
  proximityCoords?: { lat: number; lng: number } | null
): Promise<SearchResultPlace[]> {
  if (!query || query.trim().length === 0) return [];

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
  const localMatches = searchLocalPlaces(cleanQuery, prox);
  localMatches.forEach((p) => addUniqueResult(p));

  // 2. Client-side: Query internal API route /api/geocode (which handles multi-provider cascaded search with Referer authorization)
  if (typeof window !== 'undefined') {
    try {
      const houseNoParam = parsedHouseNo ? `&houseNumber=${encodeURIComponent(parsedHouseNo)}` : '';
      const streetParam = streetOrPlaceQuery ? `&street=${encodeURIComponent(streetOrPlaceQuery)}` : '';
      const apiEndpoint = `/api/geocode?q=${encodeURIComponent(cleanQuery)}${houseNoParam}${streetParam}&lat=${prox.lat}&lng=${prox.lng}`;
      const res = await fetchWithTimeout(apiEndpoint, {}, 2500);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data.places)) {
          data.places.forEach((p: SearchResultPlace) => {
            addUniqueResult(p);
          });
        }
      }
    } catch (err) {
      console.warn('Internal geocode API lookup notice:', err);
    }
  }

  // 3. Query Mapbox Geocoding directly if needed (with timeout and Referer)
  if (MAPBOX_TOKEN && combinedResults.length < 20) {
    const queryVariants = Array.from(
      new Set([cleanQuery, normalizedQuery, streetOrPlaceQuery, `${streetOrPlaceQuery || cleanQuery}, Kimberley`])
    ).filter((q): q is string => Boolean(q && q.length >= 2));

    for (const qVar of queryVariants) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          qVar
        )}.json?country=za&types=address,poi,neighborhood,locality,place&autocomplete=true&fuzzyMatch=true&proximity=${prox.lng},${prox.lat}&limit=8&access_token=${MAPBOX_TOKEN}`;
        const res = await fetchWithTimeout(
          endpoint,
          {
            headers: {
              'Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
              'Accept': 'application/json',
            },
          },
          2500
        );
        if (res && res.ok) {
          const data = await res.json();
          if (data.features && Array.isArray(data.features)) {
            data.features.forEach((feat: any) => {
              addUniqueResult(formatMapboxFeature(feat, parsedHouseNo));
            });
          }
        }
      } catch (err) {
        console.warn('Mapbox direct geocoding notice:', err);
      }
      if (combinedResults.length >= 30) break;
    }
  }

  // 4. Query Photon API (OpenStreetMap-based) only if results are still sparse, with strict 2000ms timeout
  if (combinedResults.length < 10) {
    try {
      const pQuery = `${streetOrPlaceQuery || cleanQuery}, Kimberley`;
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        pQuery
      )}&lat=${prox.lat}&lon=${prox.lng}&limit=6`;
      const pRes = await fetchWithTimeout(photonUrl, {}, 2000);
      if (pRes && pRes.ok) {
        const pData = await pRes.json();
        if (Array.isArray(pData.features)) {
          pData.features.forEach((feat: any) => {
            const ccode = feat.properties?.countrycode;
            if (ccode && ccode.toUpperCase() !== 'ZA') return;
            addUniqueResult(formatPhotonFeature(feat, parsedHouseNo));
          });
        }
      }
    } catch (err) {
      console.warn('Photon geocoding notice:', err);
    }
  }

  // 5. Re-sort merged results by relevance score so top remote or local matches rank highest
  const queryLower = cleanQuery.toLowerCase();
  const normalizedLower = normalizedQuery.toLowerCase();
  const stopWords = new Set(['in', 'at', 'near', 'the', 'of', 'and', 'za', 'south', 'africa', 'street', 'st', 'road', 'rd', 'avenue', 'ave']);
  const userTokens = queryLower
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !stopWords.has(t));

  combinedResults.sort((a, b) => {
    const scoreA = scorePlaceRelevance(a, queryLower, normalizedLower, userTokens, parsedHouseNo, streetOrPlaceQuery, prox);
    const scoreB = scorePlaceRelevance(b, queryLower, normalizedLower, userTokens, parsedHouseNo, streetOrPlaceQuery, prox);

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    const distA = calculateDistanceKm(prox.lat, prox.lng, a.lat, a.lon);
    const distB = calculateDistanceKm(prox.lat, prox.lng, b.lat, b.lon);
    return distA - distB;
  });

  return combinedResults.slice(0, 40);
}

/**
 * Reverse Geocoding: Converts GPS coordinates into a detailed South African street/building address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // 1. Try internal server-side API (handles Mapbox + Nominatim with proper Referer & User-Agent)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetchWithTimeout(`/api/geocode?action=reverse&lat=${lat}&lng=${lng}`, {}, 2500);
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.address) {
          return data.address;
        }
      }
    } catch (err) {
      console.warn('Internal reverse geocoding notice:', err);
    }
  }

  // 2. Try Mapbox Reverse Geocoding directly with Referer header
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=za&types=address,poi,neighborhood,locality,place&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetchWithTimeout(
        endpoint,
        {
          headers: {
            'Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
            'Accept': 'application/json',
          },
        },
        2500
      );
      if (res && res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const formatted = formatMapboxFeature(data.features[0]);
          return formatted.display_name || formatted.name;
        }
      }
    } catch (err) {
      console.warn('Mapbox reverse geocoding notice:', err);
    }
  }

  // 3. Try Photon Reverse Geocoding with strict 2000ms timeout
  try {
    const photonRevUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const pRes = await fetchWithTimeout(photonRevUrl, {}, 2000);
    if (pRes && pRes.ok) {
      const pData = await pRes.json();
      if (Array.isArray(pData.features) && pData.features.length > 0) {
        const formatted = formatPhotonFeature(pData.features[0]);
        return formatted.display_name || formatted.name;
      }
    }
  } catch (err) {
    console.warn('Photon reverse geocoding notice:', err);
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
  // 1. Try Mapbox Directions with live driving traffic (with Referer header)
  if (MAPBOX_TOKEN) {
    try {
      const endpoint = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      const res = await fetchWithTimeout(
        endpoint,
        {
          headers: {
            'Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          },
        },
        3000
      );
      if (res && res.ok) {
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
            source: 'mapbox',
          };
        }
      }
    } catch (err) {
      console.warn('Mapbox directions notice:', err);
    }
  }

  // 2. Fallback to OSRM
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetchWithTimeout(osrmUrl, {}, 3000);
    if (res && res.ok) {
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
    console.error('Both Mapbox and OSRM routing notice:', err);
  }

  return null;
}

export type TariffTierCode = 'standard' | 'morning_peak' | 'evening_peak' | 'night_owl' | 'early_dawn';

export interface TariffTier {
  code: TariffTierCode;
  name: string;
  multiplier: number;
  badge: string;
  description: string;
}

export interface FareBreakdown {
  distanceKm: number;
  baseFareZar: number;
  distanceFareZar: number;
  subtotalZar: number;
  multiplier: number;
  totalFare: number;
  tariff: TariffTier;
}

/**
 * Returns South African Time-of-Day Tariff tier based on local time
 */
export function getTimeOfDayTariff(date: Date = new Date()): TariffTier {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeVal = hour + minute / 60;

  // Night Owl: 22:00 to 05:00
  if (timeVal >= 22.0 || timeVal < 5.0) {
    return {
      code: 'night_owl',
      name: 'Night Owl & Safety',
      multiplier: 1.25,
      badge: '🦉 Night Owl (+25%)',
      description: 'Late-night driver availability & safety incentive',
    };
  }

  // Morning Rush: 06:30 to 08:30
  if (timeVal >= 6.5 && timeVal < 8.5) {
    return {
      code: 'morning_peak',
      name: 'Morning Rush',
      multiplier: 1.15,
      badge: '🌅 Morning Peak (+15%)',
      description: 'Peak morning commuting and school traffic tariff',
    };
  }

  // Evening Commute Peak: 16:30 to 18:30
  if (timeVal >= 16.5 && timeVal < 18.5) {
    return {
      code: 'evening_peak',
      name: 'Evening Commute',
      multiplier: 1.15,
      badge: '🌆 Evening Peak (+15%)',
      description: 'Peak evening home-bound commuting traffic tariff',
    };
  }

  // Early Dawn: 05:00 to 06:30
  if (timeVal >= 5.0 && timeVal < 6.5) {
    return {
      code: 'early_dawn',
      name: 'Early Dawn',
      multiplier: 1.0,
      badge: '☕ Early Dawn Standard',
      description: 'Standard early morning transfer rate',
    };
  }

  // Standard Daytime
  return {
    code: 'standard',
    name: 'Standard Daytime',
    multiplier: 1.0,
    badge: '☀️ Standard Daytime',
    description: 'Standard distance tariff (R12 base + R8/km, min R25)',
  };
}

/**
 * Computes full fare breakdown with South African Time-of-Day Tariff
 */
export function calculateDynamicFare(
  distanceKm: number,
  atTime: Date = new Date()
): FareBreakdown {
  const validDist = Math.max(0, Number(distanceKm) || 0);
  const tariff = getTimeOfDayTariff(atTime);
  const baseFareZar = 12;
  const distanceFareZar = Math.round(validDist * 8);
  const subtotalZar = baseFareZar + distanceFareZar;

  // Apply time-of-day multiplier with minimum fare floor (R25 * multiplier)
  const minimumFareZar = Math.max(25, Math.round(25 * tariff.multiplier));
  const scaledFare = Math.round(subtotalZar * tariff.multiplier);
  const totalFare = Math.max(minimumFareZar, scaledFare);

  return {
    distanceKm: validDist,
    baseFareZar,
    distanceFareZar,
    subtotalZar,
    multiplier: tariff.multiplier,
    totalFare,
    tariff,
  };
}

/**
 * Calculates fare in South African Rand (ZAR)
 * Base fare: R12 | Per-km: R8 | Minimum fare: R25
 */
export function calculateFare(
  distanceKm: number,
  dateOrOptions?: Date | { atTime?: Date; enforceStandard?: boolean }
): number {
  if (!dateOrOptions) {
    return Math.max(25, Math.round(12 + distanceKm * 8));
  }
  if (dateOrOptions instanceof Date) {
    return calculateDynamicFare(distanceKm, dateOrOptions).totalFare;
  }
  if (dateOrOptions.enforceStandard) {
    return Math.max(25, Math.round(12 + distanceKm * 8));
  }
  return calculateDynamicFare(distanceKm, dateOrOptions.atTime || new Date()).totalFare;
}

/**
 * Returns configuration for Leaflet TileLayer
 */
export function getTileLayerConfig(isDark: boolean = false) {
  if (MAPBOX_TOKEN) {
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
