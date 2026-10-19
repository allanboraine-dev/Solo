import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  checkRateLimit,
  checkGeocodeRateLimit,
  checkRegistrationRateLimit,
  checkUploadRateLimit,
  checkSosRateLimit,
  _resetRateLimits,
} from '../src/utils/rateLimit.ts';
import {
  validateDriverAuthorization,
  createUnauthorizedResponse,
} from '../src/utils/apiAuth.ts';

describe('SOLO API Security & Rate Limiting Suite', () => {
  beforeEach(() => {
    _resetRateLimits();
  });

  describe('Sliding Window Rate Limiter Engine', () => {
    test('permits requests within configured threshold', () => {
      const mockReq = new Request('https://soloride.co.za/api/test', {
        headers: { 'x-forwarded-for': '197.229.1.50' },
      });

      const res1 = checkRateLimit(mockReq, { bucket: 'unit_test', limit: 3, windowMs: 10000 });
      assert.strictEqual(res1.allowed, true);
      assert.strictEqual(res1.remaining, 2);

      const res2 = checkRateLimit(mockReq, { bucket: 'unit_test', limit: 3, windowMs: 10000 });
      assert.strictEqual(res2.allowed, true);
      assert.strictEqual(res2.remaining, 1);

      const res3 = checkRateLimit(mockReq, { bucket: 'unit_test', limit: 3, windowMs: 10000 });
      assert.strictEqual(res3.allowed, true);
      assert.strictEqual(res3.remaining, 0);
    });

    test('rejects request with HTTP 429 when rate limit is exceeded', () => {
      const mockReq = new Request('https://soloride.co.za/api/test', {
        headers: { 'x-forwarded-for': '197.229.1.60' },
      });

      for (let i = 0; i < 3; i++) {
        checkRateLimit(mockReq, { bucket: 'strict_bucket', limit: 3, windowMs: 5000 });
      }

      // 4th request exceeds limit
      const exceeded = checkRateLimit(mockReq, { bucket: 'strict_bucket', limit: 3, windowMs: 5000 });
      assert.strictEqual(exceeded.allowed, false);
      assert.strictEqual(exceeded.remaining, 0);
      assert.ok(exceeded.resetSeconds > 0);
    });

    test('isolates rate limits between different IP addresses', () => {
      const ip1Req = new Request('https://soloride.co.za/api/test', {
        headers: { 'x-forwarded-for': '102.165.1.1' },
      });
      const ip2Req = new Request('https://soloride.co.za/api/test', {
        headers: { 'x-forwarded-for': '102.165.1.2' },
      });

      for (let i = 0; i < 2; i++) {
        checkRateLimit(ip1Req, { bucket: 'ip_isolate', limit: 2, windowMs: 10000 });
      }

      const ip1Exceeded = checkRateLimit(ip1Req, { bucket: 'ip_isolate', limit: 2, windowMs: 10000 });
      assert.strictEqual(ip1Exceeded.allowed, false);

      // ip2 should still be allowed
      const ip2Allowed = checkRateLimit(ip2Req, { bucket: 'ip_isolate', limit: 2, windowMs: 10000 });
      assert.strictEqual(ip2Allowed.allowed, true);
    });
  });

  describe('Geocoding & Registration Rate Limit Presets', () => {
    test('enforces geocoding rate limiter (45 req/min)', () => {
      const req = new Request('https://soloride.co.za/api/geocode?q=Du+Toitspan', {
        headers: { 'x-forwarded-for': '165.255.44.10' },
      });

      // 45 allowed
      for (let i = 0; i < 45; i++) {
        const check = checkGeocodeRateLimit(req);
        assert.strictEqual(check.allowed, true);
      }

      // 46th blocked
      const blocked = checkGeocodeRateLimit(req);
      assert.strictEqual(blocked.allowed, false);
      assert.ok(blocked.response);
      assert.strictEqual(blocked.response.status, 429);
      assert.ok(blocked.response.headers.get('Retry-After'));
    });

    test('enforces driver registration rate limiter (5 signups / 15 min)', () => {
      const req = new Request('https://soloride.co.za/api/driver/register', {
        method: 'POST',
        headers: { 'x-forwarded-for': '196.25.1.80' },
      });

      for (let i = 0; i < 5; i++) {
        const check = checkRegistrationRateLimit(req);
        assert.strictEqual(check.allowed, true);
      }

      const blocked = checkRegistrationRateLimit(req);
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.response?.status, 429);
    });

    test('enforces upload rate limit preset', () => {
      const req = new Request('https://soloride.co.za/api/upload-kyc-document', {
        method: 'POST',
        headers: { 'x-forwarded-for': '196.25.1.85' },
      });

      for (let i = 0; i < 15; i++) {
        assert.strictEqual(checkUploadRateLimit(req).allowed, true);
      }

      const blocked = checkUploadRateLimit(req);
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.response?.status, 429);
    });

    test('enforces emergency SOS rate limit preset', () => {
      const req = new Request('https://soloride.co.za/api/safety/sos', {
        method: 'POST',
        headers: { 'x-forwarded-for': '196.25.1.90' },
      });

      for (let i = 0; i < 10; i++) {
        assert.strictEqual(checkSosRateLimit(req).allowed, true);
      }

      const blocked = checkSosRateLimit(req);
      assert.strictEqual(blocked.allowed, false);
      assert.strictEqual(blocked.response?.status, 429);
    });
  });

  describe('Driver Authorization & BOLA (Broken Object Level Authorization) Protection', () => {
    test('authorizes admin manager session with master passcode', async () => {
      const req = new Request('https://soloride.co.za/api/driver/bank-details?driverId=driver-123', {
        headers: { 'x-admin-passcode': '13579' },
      });

      const auth = await validateDriverAuthorization(req, 'driver-123');
      assert.strictEqual(auth.authorized, true);
      assert.strictEqual(auth.user?.isAdmin, true);
    });

    test('generates standardized 403 Forbidden response payload', () => {
      const res = createUnauthorizedResponse('Forbidden: Not permitted', 403);
      assert.strictEqual(res.status, 403);
    });
  });
});
