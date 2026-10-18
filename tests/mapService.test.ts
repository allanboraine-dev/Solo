import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFare,
  getTileLayerConfig,
  parseHouseNumberFromQuery,
  toTitleCase,
  normalizeSearchQuery,
  searchPlaces,
} from '../src/utils/mapService.ts';

describe('Commercial Map & Fare Pricing Suite', () => {
  it('enforces a minimum base fare of R30 for short trips', () => {
    assert.strictEqual(calculateFare(0), 30);
    assert.strictEqual(calculateFare(0.5), 30);
    assert.strictEqual(calculateFare(1.0), 30); // 20 + (1 * 10) = 30
  });

  it('calculates accurate ZAR fares based on distance (R20 base + R10/km)', () => {
    assert.strictEqual(calculateFare(5), 70);   // 20 + 50 = 70
    assert.strictEqual(calculateFare(10), 120); // 20 + 100 = 120
    assert.strictEqual(calculateFare(25), 270); // 20 + 250 = 270
    assert.strictEqual(calculateFare(12.3), 143); // 20 + 123 = 143
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


