import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFare,
  calculateDynamicFare,
  getTimeOfDayTariff,
  getTileLayerConfig,
  parseHouseNumberFromQuery,
  toTitleCase,
  normalizeSearchQuery,
  searchPlaces,
} from '../src/utils/mapService.ts';

describe('Commercial Map & Fare Pricing Suite', () => {
  it('enforces a minimum base fare of R25 for short trips', () => {
    assert.strictEqual(calculateFare(0), 25);
    assert.strictEqual(calculateFare(0.5), 25);
    assert.strictEqual(calculateFare(1.0), 25);
    assert.strictEqual(calculateFare(1.625), 25); // 12 + 13 = 25
    assert.strictEqual(calculateFare(2.0), 28);   // 12 + 16 = 28
  });

  it('calculates accurate ZAR fares based on distance (R12 base + R8/km)', () => {
    assert.strictEqual(calculateFare(5), 52);     // 12 + 40 = 52
    assert.strictEqual(calculateFare(10), 92);    // 12 + 80 = 92
    assert.strictEqual(calculateFare(25), 212);   // 12 + 200 = 212
    assert.strictEqual(calculateFare(12.3), 110); // 12 + 98 = 110
  });

  it('automatically regulates trip fees based on South African Time-of-Day tariff schedule', () => {
    // 1. Morning Rush: 07:30 (06:30 - 08:30) -> +15%
    const morningDate = new Date();
    morningDate.setHours(7, 30, 0, 0);
    const morningTariff = getTimeOfDayTariff(morningDate);
    assert.strictEqual(morningTariff.code, 'morning_peak');
    assert.strictEqual(morningTariff.multiplier, 1.15);
    const morningBreakdown = calculateDynamicFare(5, morningDate);
    // 5km standard is R52. With +15%: 52 * 1.15 = 59.8 -> R60
    assert.strictEqual(morningBreakdown.totalFare, 60);
    assert.strictEqual(calculateFare(5, morningDate), 60);

    // 2. Daytime Standard: 12:00 (08:30 - 16:30) -> 1.0x
    const middayDate = new Date();
    middayDate.setHours(12, 0, 0, 0);
    const middayTariff = getTimeOfDayTariff(middayDate);
    assert.strictEqual(middayTariff.code, 'standard');
    assert.strictEqual(middayTariff.multiplier, 1.0);
    assert.strictEqual(calculateFare(5, middayDate), 52);

    // 3. Evening Commute: 17:30 (16:30 - 18:30) -> +15%
    const eveningDate = new Date();
    eveningDate.setHours(17, 30, 0, 0);
    const eveningTariff = getTimeOfDayTariff(eveningDate);
    assert.strictEqual(eveningTariff.code, 'evening_peak');
    assert.strictEqual(eveningTariff.multiplier, 1.15);
    assert.strictEqual(calculateFare(5, eveningDate), 60);

    // 4. Night Owl: 23:30 (22:00 - 05:00) -> +25%
    const nightDate = new Date();
    nightDate.setHours(23, 30, 0, 0);
    const nightTariff = getTimeOfDayTariff(nightDate);
    assert.strictEqual(nightTariff.code, 'night_owl');
    assert.strictEqual(nightTariff.multiplier, 1.25);
    // 5km standard is R52. With +25%: 52 * 1.25 = 65 -> R65
    assert.strictEqual(calculateDynamicFare(5, nightDate).totalFare, 65);
    assert.strictEqual(calculateFare(5, nightDate), 65);

    // 5. Early 02:00 AM (still Night Owl) -> +25%
    const earlyHoursDate = new Date();
    earlyHoursDate.setHours(2, 0, 0, 0);
    assert.strictEqual(getTimeOfDayTariff(earlyHoursDate).code, 'night_owl');
    assert.strictEqual(calculateFare(5, earlyHoursDate), 65);

    // 6. Early Dawn: 05:30 -> 1.0x
    const dawnDate = new Date();
    dawnDate.setHours(5, 30, 0, 0);
    assert.strictEqual(getTimeOfDayTariff(dawnDate).code, 'early_dawn');
    assert.strictEqual(calculateFare(5, dawnDate), 52);
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


