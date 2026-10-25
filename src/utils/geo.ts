/**
 * Geospatial Utilities & Haversine Distance Calculations
 */

/**
 * Calculates the great-circle distance between two points on the Earth in kilometers using the Haversine formula.
 */
export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;

  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calculates distance in meters.
 */
export function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.round(calculateDistanceKm(lat1, lng1, lat2, lng2) * 1000);
}

/**
 * Checks if target coordinates are within a specified radius (in kilometers).
 */
export function isWithinRadiusKm(
  sourceLat: number,
  sourceLng: number,
  targetLat: number,
  targetLng: number,
  radiusKm: number
): boolean {
  return calculateDistanceKm(sourceLat, sourceLng, targetLat, targetLng) <= radiusKm;
}

/**
 * Estimates driving ETA in minutes based on distance (assuming an urban average speed of 35 km/h).
 */
export function estimateEtaMinutes(distanceKm: number, averageSpeedKmh: number = 35): number {
  if (distanceKm <= 0) return 1;
  const hours = distanceKm / averageSpeedKmh;
  return Math.max(1, Math.round(hours * 60));
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates (unrounded)
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

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
