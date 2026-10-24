import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  searchLocalPlaces,
  searchPlaces,
  parseHouseNumberFromQuery,
  normalizeSearchQuery,
  toTitleCase,
  reverseGeocode,
} from '../src/utils/mapService.ts';

describe('Location Search Improvements Suite', () => {
  it('handles typos and fuzzy matching gracefully', () => {
    // 1. "diamon" typo should still score Diamond Pavilion Mall first
    const diamondTypo = searchLocalPlaces('diamon');
    assert.ok(diamondTypo.length > 0, 'Should find places for "diamon" typo');
    assert.ok(diamondTypo[0].name.toLowerCase().includes('diamond'));

    // 2. "garip" typo should find Mediclinic Gariep
    const gariepTypo = searchLocalPlaces('garip');
    assert.ok(gariepTypo.length > 0, 'Should find Gariep for typo');
    assert.ok(gariepTypo.some(p => p.name.toLowerCase().includes('gariep')));

    // 3. "platje" typo should find Sol Plaatje University
    const spuTypo = searchLocalPlaces('platje');
    assert.ok(spuTypo.length > 0, 'Should find Sol Plaatje');
    assert.ok(spuTypo.some(p => p.name.toLowerCase().includes('plaatje') || p.name.toLowerCase().includes('spu')));
  });

  it('ranks exact and word-prefix matches higher than broad substring matches', () => {
    // Searching "Niobe" should rank "Niobe Street" at the top, not some random street with "ni" in it
    const niobeResults = searchLocalPlaces('Niobe');
    assert.ok(niobeResults.length > 0);
    assert.strictEqual(niobeResults[0].name, 'Niobe Street');

    // Searching "Dalham" should rank "Dalham Road" first
    const dalhamResults = searchLocalPlaces('Dalham');
    assert.ok(dalhamResults.length > 0);
    assert.strictEqual(dalhamResults[0].name, 'Dalham Road');
  });

  it('extracts and associates house numbers with street matches', () => {
    const query = '14 Niobe Street';
    const parsed = parseHouseNumberFromQuery(query);
    assert.strictEqual(parsed.houseNumber, '14');
    assert.strictEqual(parsed.remainder, 'Niobe Street');

    const results = searchLocalPlaces(query);
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].houseNumber, '14');
    assert.strictEqual(results[0].name, '14 Niobe Street');
  });

  it('supports South African erf / stand query parsing', () => {
    const standQuery = 'Stand 405 Nobengula Extension';
    const parsedStand = parseHouseNumberFromQuery(standQuery);
    assert.strictEqual(parsedStand.houseNumber, '405');
    assert.strictEqual(parsedStand.remainder, 'Nobengula Extension');

    const erfQuery = 'Erf 1234 Barkly Road';
    const parsedErf = parseHouseNumberFromQuery(erfQuery);
    assert.strictEqual(parsedErf.houseNumber, '1234');
    assert.strictEqual(parsedErf.remainder, 'Barkly Road');
  });

  it('covers major Kimberley shopping, medical, educational, and transport hubs', () => {
    const places = searchLocalPlaces('');
    const names = places.map(p => p.name.toLowerCase());

    // Malls & Shopping
    assert.ok(names.some(n => n.includes('diamond pavilion')));
    assert.ok(names.some(n => n.includes('north cape mall')));
    assert.ok(names.some(n => n.includes('new park')));
    assert.ok(names.some(n => n.includes('shoprite')));

    // Hospitals
    assert.ok(names.some(n => n.includes('sobukwe') || n.includes('kimberley hospital')));
    assert.ok(names.some(n => n.includes('gariep')));
    assert.ok(names.some(n => n.includes('lenmed')));

    // Universities & Schools
    assert.ok(names.some(n => n.includes('sol plaatje university')));
    assert.ok(names.some(n => n.includes('boys high')));
    assert.ok(names.some(n => n.includes('girls high')));

    // Transport
    assert.ok(names.some(n => n.includes('airport')));
    assert.ok(names.some(n => n.includes('station') || n.includes('train')));
    assert.ok(names.some(n => n.includes('taxi rank')));
  });

  it('provides reverse geocoding fallback for GPS pin coordinates', async () => {
    const fallback = await reverseGeocode(-28.7282, 24.7623);
    assert.ok(typeof fallback === 'string');
    assert.ok(fallback.length > 0);
  });

  it('correctly parses raw GPS coordinates and Google Maps URLs', () => {
    const coordPattern = /^([-+]?\d{1,2}\.\d+)[,\s]+([-+]?\d{1,3}\.\d+)$/;
    const m1 = '-28.7415, 24.7670'.match(coordPattern);
    assert.ok(m1);
    assert.strictEqual(parseFloat(m1[1]), -28.7415);
    assert.strictEqual(parseFloat(m1[2]), 24.767);

    const googleUrl = 'https://www.google.com/maps/place/Kimberley/@-28.7415,24.7670,17z';
    const m2 = googleUrl.match(/@([-+]?\d{1,2}\.\d+),([-+]?\d{1,3}\.\d+)/);
    assert.ok(m2);
    assert.strictEqual(parseFloat(m2[1]), -28.7415);
    assert.strictEqual(parseFloat(m2[2]), 24.767);
  });
});
