import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeEmail,
  normalizePhone,
  normalizeLicensePlate,
  normalizePrdpNumber,
  checkDriverDuplicatesInMemory,
} from '../src/utils/driverValidation.ts';
import {
  saveKycDriverProfile,
  checkDuplicateKycDriver,
  getAllKycDriverProfiles,
} from '../src/utils/kycStore.ts';

describe('SOLO Driver Duplicate Registration Restriction Suite', () => {
  describe('Identifier Normalization Functions', () => {
    test('normalizes email addresses (lowercased and trimmed)', () => {
      assert.strictEqual(normalizeEmail('  Driver.Test@Example.COM  '), 'driver.test@example.com');
      assert.strictEqual(normalizeEmail(''), '');
      assert.strictEqual(normalizeEmail(null), '');
    });

    test('normalizes South African phone numbers into E.164 format', () => {
      assert.strictEqual(normalizePhone('082 123 4567'), '+27821234567');
      assert.strictEqual(normalizePhone('+27 82 123 4567'), '+27821234567');
      assert.strictEqual(normalizePhone('0821234567'), '+27821234567');
      assert.strictEqual(normalizePhone('27821234567'), '+27821234567');
    });

    test('normalizes vehicle license plates (uppercase, stripped spaces/dashes)', () => {
      assert.strictEqual(normalizeLicensePlate('ca 123-456'), 'CA123456');
      assert.strictEqual(normalizeLicensePlate('CA 123 456'), 'CA123456');
      assert.strictEqual(normalizeLicensePlate('gp 99 ab gp'), 'GP99ABGP');
      assert.strictEqual(normalizeLicensePlate('WP_888-999'), 'WP888999');
    });

    test('normalizes PrDP permit numbers (uppercase, stripped spaces/dashes)', () => {
      assert.strictEqual(normalizePrdpNumber('prdp-987654'), 'PRDP987654');
      assert.strictEqual(normalizePrdpNumber('PRDP 987 654'), 'PRDP987654');
      assert.strictEqual(normalizePrdpNumber('  prdp_12345  '), 'PRDP12345');
    });
  });

  describe('In-Memory Duplicate Detection Logic', () => {
    const existingDriverList = [
      {
        id: 'driver-existing-1',
        fullName: 'Thabo Mokoena',
        email: 'thabo@example.co.za',
        phone: '+27821112233',
        licensePlate: 'CA 100-200',
        prdpNumber: 'PRDP-001122',
      },
      {
        id: 'driver-existing-2',
        fullName: 'Mandla Khumalo',
        email: 'mandla@example.co.za',
        phone: '+27839998877',
        licensePlate: 'GP 55 ZZ GP',
        prdpNumber: 'PRDP-998877',
      },
    ];

    test('detects duplicate email address regardless of case', () => {
      const result = checkDriverDuplicatesInMemory(
        { email: 'THABO@EXAMPLE.CO.ZA' },
        existingDriverList
      );
      assert.strictEqual(result.isDuplicate, true);
      assert.strictEqual(result.field, 'email');
      assert.ok(result.message?.includes('email address already exists'));
    });

    test('detects duplicate phone number across varying formats', () => {
      const result1 = checkDriverDuplicatesInMemory(
        { phone: '082 111 2233' },
        existingDriverList
      );
      assert.strictEqual(result1.isDuplicate, true);
      assert.strictEqual(result1.field, 'phone');

      const result2 = checkDriverDuplicatesInMemory(
        { phone: '0839998877' },
        existingDriverList
      );
      assert.strictEqual(result2.isDuplicate, true);
      assert.strictEqual(result2.field, 'phone');
    });

    test('detects duplicate vehicle license plate number across spacing and casing', () => {
      const result = checkDriverDuplicatesInMemory(
        { licensePlate: 'ca100200' },
        existingDriverList
      );
      assert.strictEqual(result.isDuplicate, true);
      assert.strictEqual(result.field, 'licensePlate');
      assert.ok(result.message?.includes('license plate'));
    });

    test('detects duplicate PrDP permit number', () => {
      const result = checkDriverDuplicatesInMemory(
        { prdpNumber: 'prdp001122' },
        existingDriverList
      );
      assert.strictEqual(result.isDuplicate, true);
      assert.strictEqual(result.field, 'prdpNumber');
      assert.ok(result.message?.includes('PrDP permit'));
    });

    test('permits updating profile for the same driver without false-positive duplicate error', () => {
      const result = checkDriverDuplicatesInMemory(
        {
          driverId: 'driver-existing-1',
          email: 'thabo@example.co.za',
          phone: '+27821112233',
          licensePlate: 'CA 100-200',
          prdpNumber: 'PRDP-001122',
        },
        existingDriverList
      );
      assert.strictEqual(result.isDuplicate, false);
    });

    test('permits completely new, unique driver registration', () => {
      const result = checkDriverDuplicatesInMemory(
        {
          email: 'brandnew@example.co.za',
          phone: '071 555 1234',
          licensePlate: 'CY 777-888',
          prdpNumber: 'PRDP-555555',
        },
        existingDriverList
      );
      assert.strictEqual(result.isDuplicate, false);
    });
  });

  describe('KycStore Duplicate Driver Verification', () => {
    const seedDriverId = 'test-seed-driver-unique';

    // Seed one driver into kycStore
    saveKycDriverProfile({
      id: seedDriverId,
      fullName: 'Bongani Sithole',
      email: 'bongani.unique@test.co.za',
      phone: '+27845551122',
      licensePlate: 'ND 888-999',
      prdpNumber: 'PRDP-ND-888999',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla',
    });

    test('checkDuplicateKycDriver detects seeded driver profile duplicates', () => {
      const emailDup = checkDuplicateKycDriver({ email: 'BONGANI.UNIQUE@TEST.CO.ZA' });
      assert.strictEqual(emailDup.isDuplicate, true);
      assert.strictEqual(emailDup.field, 'email');

      const phoneDup = checkDuplicateKycDriver({ phone: '084 555 1122' });
      assert.strictEqual(phoneDup.isDuplicate, true);
      assert.strictEqual(phoneDup.field, 'phone');

      const plateDup = checkDuplicateKycDriver({ licensePlate: 'nd888999' });
      assert.strictEqual(plateDup.isDuplicate, true);
      assert.strictEqual(plateDup.field, 'licensePlate');

      const prdpDup = checkDuplicateKycDriver({ prdpNumber: 'prdp-nd-888999' });
      assert.strictEqual(prdpDup.isDuplicate, true);
      assert.strictEqual(prdpDup.field, 'prdpNumber');
    });

    test('checkDuplicateKycDriver allows update of same driver ID without conflict', () => {
      const selfUpdate = checkDuplicateKycDriver({
        driverId: seedDriverId,
        email: 'bongani.unique@test.co.za',
        phone: '+27845551122',
        licensePlate: 'ND 888-999',
        prdpNumber: 'PRDP-ND-888999',
      });
      assert.strictEqual(selfUpdate.isDuplicate, false);
    });

    test('checkDuplicateKycDriver allows unconflicting new values', () => {
      const fresh = checkDuplicateKycDriver({
        email: 'completely.fresh@test.co.za',
        phone: '079 000 1111',
        licensePlate: 'CA 999-000',
        prdpNumber: 'PRDP-FRESH-99',
      });
      assert.strictEqual(fresh.isDuplicate, false);
    });
  });

  describe('Static Architecture & Security Assertions', () => {
    test('verifies driver registration page enforces duplicate pre-checks on Step 1 and Step 2', () => {
      const pageCode = fs.readFileSync(
        path.join(process.cwd(), 'src/app/driver/register/page.tsx'),
        'utf8'
      );

      assert.ok(
        pageCode.includes('/api/driver/check-duplicate'),
        'Driver register page must call /api/driver/check-duplicate'
      );
      assert.ok(
        pageCode.includes('handleStep1Next'),
        'Driver register page must have dedicated handleStep1Next validator'
      );
      assert.ok(
        pageCode.includes('handleStep2Next'),
        'Driver register page must have dedicated handleStep2Next validator'
      );
      assert.ok(
        pageCode.includes('isValidSAPhone'),
        'Driver register page must validate South African phone numbers'
      );
    });

    test('verifies registration API route enforces duplicate checks with HTTP 409 Conflict', () => {
      const routeCode = fs.readFileSync(
        path.join(process.cwd(), 'src/app/api/driver/register/route.ts'),
        'utf8'
      );

      assert.ok(
        routeCode.includes('checkDuplicateKycDriver'),
        'Register route must invoke checkDuplicateKycDriver'
      );
      assert.ok(
        routeCode.includes('status: 409'),
        'Register route must return HTTP 409 status on duplicate registration'
      );
      assert.ok(
        routeCode.includes('DUPLICATE_REGISTRATION'),
        'Register route must return DUPLICATE_REGISTRATION error code'
      );
    });

    test('verifies migration 0011 declares unique constraints for phone, license plate, and PrDP', () => {
      const migrationCode = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/0011_restrict_duplicate_driver_registrations.sql'),
        'utf8'
      );

      assert.ok(
        migrationCode.includes('idx_driver_profiles_unique_phone'),
        'Migration 0011 must define idx_driver_profiles_unique_phone'
      );
      assert.ok(
        migrationCode.includes('idx_driver_profiles_unique_license_plate'),
        'Migration 0011 must define idx_driver_profiles_unique_license_plate'
      );
      assert.ok(
        migrationCode.includes('idx_driver_profiles_unique_prdp_number'),
        'Migration 0011 must define idx_driver_profiles_unique_prdp_number'
      );
    });
  });
});
