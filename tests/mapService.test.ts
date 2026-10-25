import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFare,
  calculateDynamicFare,
  estimateCompetitorFares,
  getTimeOfDayTariff,
  getTileLayerConfig,
  parseHouseNumberFromQuery,
  toTitleCase,
  normalizeSearchQuery,
  searchPlaces,
} from '../src/utils/mapService.ts';

describe('Commercial Map & Fare Pricing Suite', () => {
  it('enforces a minimum base fare of R22 for short trips', () => {
    assert.strictEqual(calculateFare(0), 22);
    assert.strictEqual(calculateFare(0.5), 22);
    assert.strictEqual(calculateFare(1.0), 22);
    assert.strictEqual(calculateFare(1.8), 22);   // 10 + 12 = 22
    assert.strictEqual(calculateFare(2.0), 23);   // 10 + 13 = 23
  });

  it('calculates accurate ZAR fares using distance-tapered rates (R10 base + R6.50/km ≤5km, R5.50/km >5km)', () => {
    assert.strictEqual(calculateFare(5), 43);     // 10 + round(5 * 6.5) = 10 + 33 = 43
    assert.strictEqual(calculateFare(10), 70);    // 10 + round(32.5 + 5 * 5.5) = 10 + 60 = 70
    assert.strictEqual(calculateFare(25), 153);   // 10 + round(32.5 + 20 * 5.5) = 10 + 143 = 153
    assert.strictEqual(calculateFare(12.3), 83);  // 10 + round(32.5 + 7.3 * 5.5) = 10 + 73 = 83
  });

  it('always undercuts competitor (Bolt & UberX) fares by at least 20% and rewards 1-rider Solo trips', () => {
    const testDistances = [1, 2.5, 5, 10, 18, 30];
    for (const dist of testDistances) {
      const solo1Rider = calculateDynamicFare(dist, new Date(), { occupantCount: 1, enforceStandard: true });
      const solo2Riders = calculateDynamicFare(dist, new Date(), { occupantCount: 2, enforceStandard: true });
      const comp = estimateCompetitorFares(dist);

      assert.strictEqual(solo1Rider.undercutGuaranteed, true, `SOLO must undercut competitors at ${dist}km`);
      assert.ok(
        solo1Rider.totalFare <= comp.guaranteedCeilingZar,
        `SOLO fare R${solo1Rider.totalFare} must not exceed 80% competitor ceiling R${comp.guaranteedCeilingZar}`
      );
      assert.ok(solo1Rider.comparison.savingsPercentVsLowest >= 20, 'Savings vs lowest competitor must be >= 20%');
      assert.ok(solo2Riders.totalFare >= solo1Rider.totalFare, '2-rider shared trip is >= 1-rider Solo rate');
      assert.ok(
        solo2Riders.totalFare <= comp.guaranteedCeilingZar,
        'Even 2-rider fare remains at least 20% cheaper than lowest competitor'
      );
    }
  });

  it('automatically regulates trip fees based on softened South African Time-of-Day tariff schedule', () => {
    // 1. Morning Rush: 07:30 (06:30 - 08:30) -> +5%
    const morningDate = new Date();
    morningDate.setHours(7, 30, 0, 0);
    const morningTariff = getTimeOfDayTariff(morningDate);
    assert.strictEqual(morningTariff.code, 'morning_peak');
    assert.strictEqual(morningTariff.multiplier, 1.05);
    const morningBreakdown = calculateDynamicFare(5, morningDate);
    // 5km standard is R43. With +5%: 43 * 1.05 = 45.15 -> R45
    assert.strictEqual(morningBreakdown.totalFare, 45);
    assert.strictEqual(calculateFare(5, morningDate), 45);

    // 2. Daytime Standard: 12:00 (08:30 - 16:30) -> 1.0x
    const middayDate = new Date();
    middayDate.setHours(12, 0, 0, 0);
    const middayTariff = getTimeOfDayTariff(middayDate);
    assert.strictEqual(middayTariff.code, 'standard');
    assert.strictEqual(middayTariff.multiplier, 1.0);
    assert.strictEqual(calculateFare(5, middayDate), 43);

    // 3. Evening Commute: 17:30 (16:30 - 18:30) -> +5%
    const eveningDate = new Date();
    eveningDate.setHours(17, 30, 0, 0);
    const eveningTariff = getTimeOfDayTariff(eveningDate);
    assert.strictEqual(eveningTariff.code, 'evening_peak');
    assert.strictEqual(eveningTariff.multiplier, 1.05);
    assert.strictEqual(calculateFare(5, eveningDate), 45);

    // 4. Night Owl: 23:30 (22:00 - 05:00) -> +15%
    const nightDate = new Date();
    nightDate.setHours(23, 30, 0, 0);
    const nightTariff = getTimeOfDayTariff(nightDate);
    assert.strictEqual(nightTariff.code, 'night_owl');
    assert.strictEqual(nightTariff.multiplier, 1.15);
    // 5km standard is R43. With +15%: 43 * 1.15 = 49.45 -> R49
    assert.strictEqual(calculateDynamicFare(5, nightDate).totalFare, 49);
    assert.strictEqual(calculateFare(5, nightDate), 49);

    // 5. Early 02:00 AM (still Night Owl) -> +15%
    const earlyHoursDate = new Date();
    earlyHoursDate.setHours(2, 0, 0, 0);
    assert.strictEqual(getTimeOfDayTariff(earlyHoursDate).code, 'night_owl');
    assert.strictEqual(calculateFare(5, earlyHoursDate), 49);

    // 6. Early Dawn: 05:30 -> 1.0x
    const dawnDate = new Date();
    dawnDate.setHours(5, 30, 0, 0);
    assert.strictEqual(getTimeOfDayTariff(dawnDate).code, 'early_dawn');
    assert.strictEqual(calculateFare(5, dawnDate), 43);
  });

  it('provides Mapbox tile layer configuration with retina high-DPI support', () => {
    const lightConfig = getTileLayerConfig(false);
    assert.ok(lightConfig.url.includes('api.mapbox.com') || lightConfig.url.includes('openstreetmap.org'));
    assert.ok(lightConfig.attribution.includes('OpenStreetMap'));
    assert.strictEqual(lightConfig.maxZoom, 19);

    const darkConfig = getTileLayerConfig(true);
    assert.ok(darkConfig.url.length > 0);
  });

  it('extracts house numbers, unit suffixes, and stand/erf prefixes from street address queries', () => {
    const parsed1 = parseHouseNumberFromQuery('14 Niobe Street, Kimberley');
    assert.strictEqual(parsed1.houseNumber, '14');
    assert.strictEqual(parsed1.remainder, 'Niobe Street, Kimberley');

    const parsed2 = parseHouseNumberFromQuery('22B Memorial Road');
    assert.strictEqual(parsed2.houseNumber, '22B');
    assert.strictEqual(parsed2.remainder, 'Memorial Road');

    const parsed3 = parseHouseNumberFromQuery('No. 108 Du Toitspan Road');
    assert.strictEqual(parsed3.houseNumber, '108');
    assert.strictEqual(parsed3.remainder, 'Du Toitspan Road');

    const parsed4 = parseHouseNumberFromQuery('North Cape Mall');
    assert.strictEqual(parsed4.houseNumber, undefined);
    assert.strictEqual(parsed4.remainder, 'North Cape Mall');
  });

  it('converts lowercase text into Title Case correctly', () => {
    assert.strictEqual(toTitleCase('niobe street'), 'Niobe Street');
    assert.strictEqual(toTitleCase('memorial road, kimberley'), 'Memorial Road, Kimberley');
    assert.strictEqual(toTitleCase('14 niobe'), '14 Niobe');
  });

  it('normalizes compound Afrikaans/South African street names and abbreviations regardless of input case', () => {
    // Lowercase compound street names
    assert.strictEqual(normalizeSearchQuery('dutoitspan'), 'Du Toitspan Road');
    assert.strictEqual(normalizeSearchQuery('dutoitspan rd'), 'Du Toitspan Road');
    assert.strictEqual(normalizeSearchQuery('debeers'), 'De Beers Road');
    assert.strictEqual(normalizeSearchQuery('14 niobe st'), '14 Niobe Street');
    assert.strictEqual(normalizeSearchQuery('22b memorial rd'), '22B Memorial Road');
    assert.strictEqual(normalizeSearchQuery('spu'), 'Sol Plaatje University');
    assert.strictEqual(normalizeSearchQuery('big hole'), 'The Big Hole, Kimberley');
  });

  it('performs case-insensitive searches and resolves Kimberley landmarks without requiring uppercase typing', async () => {
    // 1. Lowercase search for hospital/dutoitspan
    const hospitalResults = await searchPlaces('dutoitspan');
    assert.ok(hospitalResults.length > 0, 'Expected results for lowercase "dutoitspan"');
    const hospitalMatch = hospitalResults.some((r) =>
      r.name.toLowerCase().includes('du toitspan') ||
      r.display_name.toLowerCase().includes('du toitspan')
    );
    assert.ok(hospitalMatch, 'Should find Du Toitspan Road or Robert Mangaliso Sobukwe Hospital');

    // 2. Lowercase search for popular malls
    const mallResults = await searchPlaces('diamond pavilion');
    assert.ok(mallResults.length > 0, 'Expected results for lowercase "diamond pavilion"');
    assert.ok(mallResults[0].name.includes('Diamond Pavilion Mall'));

    // 3. Lowercase search with house number
    const addressResults = await searchPlaces('14 diamond pavilion');
    assert.ok(addressResults.length > 0);
    assert.strictEqual(addressResults[0].houseNumber, '14');
  });

  it('accurately resolves house numbers entered with street names and prioritizes exact address pins', async () => {
    // 1. Search house number + street name (e.g. "14 Carrington Road")
    const carringtonResults = await searchPlaces('14 Carrington Road');
    assert.ok(carringtonResults.length > 0, 'Expected results for "14 Carrington Road"');
    const firstCarrington = carringtonResults[0];
    assert.strictEqual(firstCarrington.houseNumber, '14');
    assert.ok(firstCarrington.name.includes('14 Carrington Road'));
    assert.strictEqual(firstCarrington.category, 'address');

    // 2. Search house number + partial street (e.g. "25 Dalham")
    const dalhamResults = await searchPlaces('25 Dalham');
    assert.ok(dalhamResults.length > 0, 'Expected results for "25 Dalham"');
    const firstDalham = dalhamResults[0];
    assert.strictEqual(firstDalham.houseNumber, '25');
    assert.ok(firstDalham.name.includes('25 Dalham Road'));

    // 3. Search trailing house number (e.g. "Aristotle Avenue 7")
    const aristotleResults = await searchPlaces('Aristotle Avenue 7');
    assert.ok(aristotleResults.length > 0);
    const firstAristotle = aristotleResults[0];
    assert.strictEqual(firstAristotle.houseNumber, '7');
    assert.ok(firstAristotle.name.includes('7 Aristotle Avenue'));

    // 4. Standalone house number suggests top Kimberley thoroughfares
    const standaloneNumberResults = await searchPlaces('14');
    assert.ok(standaloneNumberResults.length > 0);
    assert.ok(standaloneNumberResults.every(r => r.houseNumber === '14'));
    assert.ok(standaloneNumberResults.some(r => r.name.includes('Memorial Road')));
  });

  it('supports instant local 0ms search with category filters and lists all possible options', async () => {
    const { searchLocalPlaces } = await import('../src/utils/mapService.ts');

    // 1. Empty query returns all pool places without truncation
    const allPlaces = searchLocalPlaces('');
    assert.ok(allPlaces.length >= 40, 'Should list all popular places (40+)');

    // 2. Category filtering by streets
    const streetsOnly = searchLocalPlaces('', null, 'streets');
    assert.ok(streetsOnly.length >= 25, 'Should list all registered streets');
    assert.ok(streetsOnly.every((p) => p.category === 'address'));

    // 3. Category filtering by malls
    const mallsOnly = searchLocalPlaces('', null, 'malls');
    assert.ok(mallsOnly.length >= 5, 'Should list all major malls/shopping centres');

    // 4. Instant 1-letter query matches all possible candidates without truncation
    const mLetterPlaces = searchLocalPlaces('m');
    assert.ok(mLetterPlaces.length > 10, 'Should return more than 10 options for "m" without artificial cap');

    // 5. searchPlaces returns expanded options beyond old 10-item cap
    const roadResults = await searchPlaces('Road');
    assert.ok(roadResults.length > 10, 'searchPlaces should list all possible options (>10)');
  });
});


