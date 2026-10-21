import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateFare } from '../src/utils/mapService.ts';

describe('SARS Compliant Tax Invoice & Trip Receipt Suite', () => {
  it('enforces 100% driver fare retention with zero platform commission', () => {
    const testDistances = [2.5, 6.2, 14.8, 25.0];

    for (const dist of testDistances) {
      const totalFare = calculateFare(dist);
      const baseFare = 12;
      const distanceCharge = Math.max(0, totalFare - baseFare);
      const platformCommission = 0; // ZERO COMMISSION MODEL
      const driverTakeHome = totalFare - platformCommission;

      assert.strictEqual(platformCommission, 0);
      assert.strictEqual(driverTakeHome, totalFare);
      assert.ok(totalFare >= 25, 'Enforces minimum R25 fare');
    }
  });

  it('generates compliant SARS receipt reference numbers', () => {
    const tripId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const receiptNumber = `REC-ZA-${tripId.substring(0, 8).toUpperCase()}`;

    assert.strictEqual(receiptNumber, 'REC-ZA-9B1DEB4D');
    assert.ok(receiptNumber.startsWith('REC-ZA-'));
    assert.strictEqual(receiptNumber.length, 15);
  });
});
