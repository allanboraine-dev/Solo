/**
 * City Detection & Geographical Dispatch Matching Engine for SOLO
 * 
 * Rules:
 * - Trip requests are pushed strictly according to the driver's current city pool.
 * - If a driver is in Kimberley, only Kimberley requests ring their phone/modal and push to their pool.
 * - Same isolation applies to Cape Town, Johannesburg, Pretoria, Durban, Bloemfontein, etc.
 * - All trips booked across South Africa remain discoverable on the SOLO National Trip Board.
 */

import { calculateDistanceKm } from './geo.ts';

export interface SouthAfricanCity {
  name: string;
  province: string;
  lat: number;
  lng: number;
  radiusKm: number;
  aliases: string[];
}

export const SOUTH_AFRICAN_CITIES: SouthAfricanCity[] = [
  {
    name: 'Kimberley',
    province: 'Northern Cape',
    lat: -28.7419,
    lng: 24.7639,
    radiusKm: 45,
    aliases: [
      'kimberley',
      'galeshewe',
      'beaconsfield',
      'royldene',
      'hadison park',
      'monument heights',
      'belgravia',
      'roodepan',
      'sol plaatje',
      'diamond pavilion',
      'north cape mall',
      'new park',
      'rhodesdene',
      'royglen',
      'carters glen',
      'diskobolos',
      'west end',
      'herlear',
      'hillcrest',
      'klisserville',
      'florianville',
      'gemdene',
      'colville',
    ],
  },
  {
    name: 'Cape Town',
    province: 'Western Cape',
    lat: -33.9249,
    lng: 18.4241,
    radiusKm: 65,
    aliases: [
      'cape town',
      'kaapstad',
      'camps bay',
      'sea point',
      'waterfront',
      'v&a waterfront',
      'bellville',
      'stellenbosch',
      'somerset west',
      'khayelitsha',
      'mitchells plain',
      'rondebosch',
      'claremont',
      'table mountain',
      'kloof street',
      'green point',
    ],
  },
  {
    name: 'Johannesburg',
    province: 'Gauteng',
    lat: -26.2041,
    lng: 28.0473,
    radiusKm: 55,
    aliases: [
      'johannesburg',
      'joburg',
      'jhb',
      'gauteng',
      'gp',
      'sandton',
      'rosebank',
      'randburg',
      'midrand',
      'soweto',
      'roodepoort',
      'fourways',
      'melrose',
      'braamfontein',
      'balfour park',
      'highlands north',
      'bergbron',
      'burgundy',
      'burgandy',
      'burgundy hills',
      'burgandy hills',
      'burgundy hills estate',
      'burgandy hills estate',
      'hills estate',
      'florida',
      'florida glen',
      'northcliff',
      'linden',
      'cresta',
      'krugersdorp',
      'alberton',
      'germiston',
      'boksburg',
      'benoni',
      'kempton park',
      'bedfordview',
      'edenvale',
      'sandringham',
      'parkhurst',
      'parktown',
      'greenside',
      'bryanston',
      'rivonia',
      'sunninghill',
      'woodmead',
      'kyalami',
      'waterfall',
      'illovo',
      'houghton',
      'norwood',
      'orange grove',
      'alexandra',
      'randfontein',
      'ruimsig',
      'constantia kloof',
      'honeydew',
      'weltevredenpark',
      'weltevreden park',
      'boskruin',
      'bromhof',
      'northgate',
      'olivedale',
      'douglasdale',
      'lonehill',
      'paulshof',
      'morningside',
      'brakpan',
      'springs',
    ],
  },
  {
    name: 'Pretoria',
    province: 'Gauteng',
    lat: -25.7479,
    lng: 28.2293,
    radiusKm: 50,
    aliases: [
      'pretoria',
      'tshwane',
      'centurion',
      'hatfield',
      'menlyn',
      'mamelodi',
      'soshanguve',
      'arcadia',
    ],
  },
  {
    name: 'Durban',
    province: 'KwaZulu-Natal',
    lat: -29.8587,
    lng: 31.0218,
    radiusKm: 50,
    aliases: [
      'durban',
      'ethekwini',
      'umhlanga',
      'pinetown',
      'ballito',
      'chatsworth',
      'westville',
      'florida road',
      'gateway',
      'king shaka',
    ],
  },
  {
    name: 'Bloemfontein',
    province: 'Free State',
    lat: -29.0852,
    lng: 26.1596,
    radiusKm: 45,
    aliases: [
      'bloemfontein',
      'mangaung',
      'brandwag',
      'bayswater',
      'willows',
    ],
  },
  {
    name: 'Gqeberha',
    province: 'Eastern Cape',
    lat: -33.9608,
    lng: 25.6022,
    radiusKm: 45,
    aliases: [
      'gqeberha',
      'port elizabeth',
      'walmer',
      'summerstrand',
    ],
  },
  {
    name: 'East London',
    province: 'Eastern Cape',
    lat: -33.0153,
    lng: 27.9116,
    radiusKm: 40,
    aliases: [
      'east london',
      'buffalo city',
      'beacon bay',
      'nahoon',
      'vincent',
    ],
  },
  {
    name: 'Polokwane',
    province: 'Limpopo',
    lat: -23.9045,
    lng: 29.4689,
    radiusKm: 40,
    aliases: ['polokwane', 'pietersburg', 'seshego'],
  },
  {
    name: 'Nelspruit',
    province: 'Mpumalanga',
    lat: -25.4753,
    lng: 30.9694,
    radiusKm: 40,
    aliases: ['nelspruit', 'mbombela', 'white river'],
  },
  {
    name: 'Rustenburg',
    province: 'North West',
    lat: -25.6676,
    lng: 27.2424,
    radiusKm: 40,
    aliases: ['rustenburg', 'boitekong', 'tlhabane'],
  },
  {
    name: 'Upington',
    province: 'Northern Cape',
    lat: -28.4478,
    lng: 21.2561,
    radiusKm: 40,
    aliases: ['upington', 'keimoes'],
  },
];

/**
 * Resolves the primary city from GPS coordinates based on South African metro boundaries.
 */
export function resolveCityFromCoords(lat?: number | null, lng?: number | null): string | null {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  for (const city of SOUTH_AFRICAN_CITIES) {
    const dist = calculateDistanceKm(lat, lng, city.lat, city.lng);
    if (dist <= city.radiusKm) {
      return city.name;
    }
  }

  // Find nearest city if within 100km buffer
  let nearestCity: SouthAfricanCity | null = null;
  let minDistance = Infinity;

  for (const city of SOUTH_AFRICAN_CITIES) {
    const dist = calculateDistanceKm(lat, lng, city.lat, city.lng);
    if (dist < minDistance && dist <= 120) {
      minDistance = dist;
      nearestCity = city;
    }
  }

  return nearestCity ? nearestCity.name : null;
}

/**
 * Maps South African provinces to their central metropolitan hub.
 */
export const PROVINCE_TO_CITY: Record<string, string> = {
  'gauteng': 'Johannesburg',
  'gp': 'Johannesburg',
  'western cape': 'Cape Town',
  'wc': 'Cape Town',
  'kwazulu-natal': 'Durban',
  'kwazulu natal': 'Durban',
  'kzn': 'Durban',
  'free state': 'Bloemfontein',
  'fs': 'Bloemfontein',
  'eastern cape': 'Gqeberha',
  'ec': 'Gqeberha',
  'northern cape': 'Kimberley',
  'nc': 'Kimberley',
  'limpopo': 'Polokwane',
  'mpumalanga': 'Nelspruit',
  'north west': 'Rustenburg',
  'north-west': 'Rustenburg',
  'nw': 'Rustenburg',
};

/**
 * Resolves the city from textual addresses or pickup strings.
 */
export function resolveCityFromAddress(address?: string | null): string | null {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();

  // 1. Direct city and suburb alias matching
  for (const city of SOUTH_AFRICAN_CITIES) {
    for (const alias of city.aliases) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        return city.name;
      }
    }
  }

  // 2. Province-level mapping
  for (const [province, cityName] of Object.entries(PROVINCE_TO_CITY)) {
    const regex = new RegExp(`\\b${province.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      return cityName;
    }
  }

  return null;
}

/**
 * Compares two city or regional identifiers, accounting for South African metro/provincial synonyms
 * (e.g. Gauteng <-> Johannesburg, Western Cape <-> Cape Town, Northern Cape <-> Kimberley).
 */
export function areCitiesMatching(cityA?: string | null, cityB?: string | null): boolean {
  if (!cityA || !cityB) return false;
  const a = cityA.trim().toLowerCase();
  const b = cityB.trim().toLowerCase();
  if (a === b) return true;

  // Gauteng encompasses Johannesburg and Pretoria
  if ((a === 'gauteng' || a === 'gp') && (b === 'johannesburg' || b === 'pretoria' || b === 'gauteng')) return true;
  if ((b === 'gauteng' || b === 'gp') && (a === 'johannesburg' || a === 'pretoria' || a === 'gauteng')) return true;

  // Western Cape encompasses Cape Town
  if ((a === 'western cape' || a === 'wc') && (b === 'cape town' || b === 'western cape')) return true;
  if ((b === 'western cape' || b === 'wc') && (a === 'cape town' || a === 'western cape')) return true;

  // Northern Cape encompasses Kimberley
  if ((a === 'northern cape' || a === 'nc') && (b === 'kimberley' || b === 'northern cape')) return true;
  if ((b === 'northern cape' || b === 'nc') && (a === 'kimberley' || a === 'northern cape')) return true;

  return false;
}

/**
 * Combines coordinates and address text to reliably identify the city.
 * If address explicitly specifies a known South African metro/estate (like "Burgandy hills estate"),
 * that explicit address takes precedence over mismatched coordinates.
 * Returns 'Other' if completely undetermined (strictly avoids defaulting to Kimberley).
 */
export function resolveCityFromLocation(
  lat?: number | null,
  lng?: number | null,
  address?: string | null
): string {
  const fromAddress = resolveCityFromAddress(address);
  const fromCoords = resolveCityFromCoords(lat, lng);

  // If address explicitly resolves to a known South African city / metro:
  if (fromAddress) {
    if (!fromCoords || areCitiesMatching(fromCoords, fromAddress)) {
      return fromAddress;
    }

    // Coordinates disagree with explicit address (e.g. phone was in Kimberley when user booked Gauteng estate)
    const targetCity = SOUTH_AFRICAN_CITIES.find(c => areCitiesMatching(c.name, fromAddress));
    if (targetCity && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      const distFromTarget = calculateDistanceKm(lat, lng, targetCity.lat, targetCity.lng);
      if (distFromTarget > targetCity.radiusKm) {
        // Coords are far away (e.g. 450km away in Kimberley) -> trust the explicit address!
        return fromAddress;
      }
    }
    return fromAddress;
  }

  // If no explicit address match, rely on coordinates
  if (fromCoords) return fromCoords;

  return 'Other';
}

/**
 * Checks whether a given trip belongs to the driver's active city pool.
 * If driver is in Kimberley, only Kimberley requests return true.
 * Trips in Gauteng/Johannesburg or other distant regions are strictly excluded.
 */
export function isTripInDriverCity(
  trip: {
    pickup_lat?: number | null;
    pickup_lng?: number | null;
    pickup_location?: string | null;
  },
  driverLat?: number | null,
  driverLng?: number | null,
  driverCityOverride?: string | null
): boolean {
  const resolvedDriverCity =
    driverCityOverride ||
    resolveCityFromCoords(driverLat, driverLng) ||
    'Kimberley';

  // 1. Resolve trip city first
  const tripCity = resolveCityFromLocation(
    trip.pickup_lat,
    trip.pickup_lng,
    trip.pickup_location
  );

  // Unidentified ('Other') or missing trips do NOT match any local city pool
  if (!tripCity || tripCity.toLowerCase() === 'other' || tripCity.toLowerCase() === 'unknown') {
    return false;
  }

  // Trip city and driver city MUST match (e.g. Johannesburg/Gauteng vs Kimberley)
  if (!areCitiesMatching(tripCity, resolvedDriverCity)) {
    return false;
  }

  // 2. If both have GPS coordinates, verify they are within reasonable urban proximity (<= 50km)
  const hasDriverCoords =
    driverLat !== undefined &&
    driverLat !== null &&
    !Number.isNaN(driverLat) &&
    driverLng !== undefined &&
    driverLng !== null &&
    !Number.isNaN(driverLng);

  const hasTripCoords =
    trip.pickup_lat !== undefined &&
    trip.pickup_lat !== null &&
    !Number.isNaN(trip.pickup_lat) &&
    trip.pickup_lng !== undefined &&
    trip.pickup_lng !== null &&
    !Number.isNaN(trip.pickup_lng);

  if (hasDriverCoords && hasTripCoords) {
    const distanceKm = calculateDistanceKm(driverLat, driverLng, trip.pickup_lat!, trip.pickup_lng!);
    if (distanceKm > 50) {
      return false;
    }
  }

  return true;
}
