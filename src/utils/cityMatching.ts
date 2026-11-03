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
 * Resolves the city from textual addresses or pickup strings.
 */
export function resolveCityFromAddress(address?: string | null): string | null {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();

  for (const city of SOUTH_AFRICAN_CITIES) {
    for (const alias of city.aliases) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        return city.name;
      }
    }
  }

  return null;
}

/**
 * Combines coordinates and address text to reliably identify the city.
 * Defaults to Kimberley if completely undetermined.
 */
export function resolveCityFromLocation(
  lat?: number | null,
  lng?: number | null,
  address?: string | null
): string {
  const fromCoords = resolveCityFromCoords(lat, lng);
  if (fromCoords) return fromCoords;

  const fromAddress = resolveCityFromAddress(address);
  if (fromAddress) return fromAddress;

  return 'Kimberley';
}

/**
 * Checks whether a given trip belongs to the driver's active city pool.
 * If driver is in Kimberley, only Kimberley requests return true.
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

  // 1. If GPS coordinates exist for both, verify physical proximity (within 45km)
  if (
    driverLat !== undefined &&
    driverLat !== null &&
    driverLng !== undefined &&
    driverLng !== null &&
    trip.pickup_lat !== undefined &&
    trip.pickup_lat !== null &&
    trip.pickup_lng !== undefined &&
    trip.pickup_lng !== null &&
    !Number.isNaN(driverLat) &&
    !Number.isNaN(driverLng) &&
    !Number.isNaN(trip.pickup_lat) &&
    !Number.isNaN(trip.pickup_lng)
  ) {
    const distanceKm = calculateDistanceKm(driverLat, driverLng, trip.pickup_lat, trip.pickup_lng);
    // If within urban radius of driver, it is in driver pool
    if (distanceKm <= 45) {
      return true;
    }
  }

  // 2. Check resolved city of the trip
  const tripCity = resolveCityFromLocation(
    trip.pickup_lat,
    trip.pickup_lng,
    trip.pickup_location
  );

  return tripCity.toLowerCase() === resolvedDriverCity.toLowerCase();
}
