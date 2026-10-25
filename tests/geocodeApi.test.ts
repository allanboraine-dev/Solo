import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../src/app/api/geocode/route.ts';
import { haversineDistKm } from '../src/utils/geo.ts';

function createMockRequest(url: string, headers: Record<string, string> = {}): any {
  return {
    url,
    headers: {
      get: (headerName: string) => headers[headerName.toLowerCase()] || null,
    },
    ip: '127.0.0.1',
  };
}

describe('Geocoding API Route Suite (/api/geocode)', () => {
  test('haversineDistKm correctly computes distance between two GPS coordinates', () => {
    // Kimberley to Bloemfontein is ~147-155 km
    const dist = haversineDistKm(-28.7282, 24.7623, -29.0852, 26.1596);
    assert.ok(dist >= 140 && dist <= 170, `Expected ~150km, got ${dist}`);

    // Same point is 0
    const zeroDist = haversineDistKm(-28.7282, 24.7623, -28.7282, 24.7623);
    assert.equal(Math.round(zeroDist), 0);
  });

  test('GET /api/geocode returns empty array for queries < 2 characters', async () => {
    const req = createMockRequest('http://localhost:3000/api/geocode?q=a');
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.places, []);
  });

  test('GET /api/geocode parses direct decimal coordinates into a direct pin', async () => {
    const req = createMockRequest('http://localhost:3000/api/geocode?q=-28.7415,24.7670');
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.places.length > 0);
    assert.equal(body.places[0].lat, -28.7415);
    assert.equal(body.places[0].lon, 24.7670);
  });

  test('GET /api/geocode returns search results for Kimberley addresses', async () => {
    const req = createMockRequest('http://localhost:3000/api/geocode?q=Memorial+Road');
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.places));
    assert.ok(body.places.length > 0, 'Expected places for Memorial Road');
    const hasMemorial = body.places.some((p: any) =>
      p.name.toLowerCase().includes('memorial') || p.display_name.toLowerCase().includes('memorial')
    );
    assert.ok(hasMemorial, 'Results should contain Memorial Road');
  });

  test('GET /api/geocode returns search results for addresses with house numbers', async () => {
    const req = createMockRequest('http://localhost:3000/api/geocode?q=14+Memorial+Road');
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.places));
    assert.ok(body.places.length > 0, 'Expected places for 14 Memorial Road');
    const hasNumber = body.places.some((p: any) =>
      p.name.includes('14') || (p.houseNumber && p.houseNumber === '14')
    );
    assert.ok(hasNumber, 'Results should preserve house number 14');
  });

  test('GET /api/geocode returns results for locations outside Kimberley (e.g. Bloemfontein, Johannesburg)', async () => {
    const req = createMockRequest('http://localhost:3000/api/geocode?q=Bloemfontein');
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.places));
    assert.ok(body.places.length > 0, 'Expected places for Bloemfontein');
    const hasBloem = body.places.some((p: any) =>
      p.name.toLowerCase().includes('bloemfontein') || p.display_name.toLowerCase().includes('bloemfontein')
    );
    assert.ok(hasBloem, 'Results should contain Bloemfontein');
  });
});
