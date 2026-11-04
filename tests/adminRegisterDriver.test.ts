import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST as registerDriverHandler } from '../src/app/api/admin/register-driver/route.ts';
import { getKycDriverProfile } from '../src/utils/kycStore.ts';

function createMockPostRequest(body: any, headers: Record<string, string> = {}): any {
  const jsonBody = JSON.stringify(body);
  const normalizedHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  };

  return {
    method: 'POST',
    url: 'http://localhost:3000/api/admin/register-driver',
    headers: {
      get: (headerName: string) => normalizedHeaders[headerName.toLowerCase()] || null,
    },
    json: async () => JSON.parse(jsonBody),
  };
}

describe('Manager Console Driver Registration Suite', () => {
  const MASTER_PASSCODE = '13579';

  test('rejects unauthenticated public callers with HTTP 401', async () => {
    const req = createMockPostRequest({
      fullName: 'Unauthenticated Attempter',
      email: 'hacker@example.com',
      phone: '0821112222',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla',
      licensePlate: 'CA 111-222',
    });

    const res = await registerDriverHandler(req);
    assert.strictEqual(res.status, 401, 'Public request without manager credentials must be rejected with 401');
    const json = await res.json();
    assert.match(json.error, /Unauthorized/i);
  });

  test('validates required fields: fullName, email, phone, vehicleMake, vehicleModel, licensePlate', async () => {
    const testCases = [
      {
        body: { email: 'driver1@example.com', phone: '0821234567', vehicleMake: 'Toyota', vehicleModel: 'Corolla', licensePlate: 'CA 123-456' },
        expectedField: 'fullName',
      },
      {
        body: { fullName: 'John Doe', phone: '0821234567', vehicleMake: 'Toyota', vehicleModel: 'Corolla', licensePlate: 'CA 123-456' },
        expectedField: 'email',
      },
      {
        body: { fullName: 'John Doe', email: 'driver2@example.com', vehicleMake: 'Toyota', vehicleModel: 'Corolla', licensePlate: 'CA 123-456' },
        expectedField: 'phone',
      },
      {
        body: { fullName: 'John Doe', email: 'driver3@example.com', phone: '0821234567', vehicleModel: 'Corolla', licensePlate: 'CA 123-456' },
        expectedField: 'vehicleMake',
      },
      {
        body: { fullName: 'John Doe', email: 'driver4@example.com', phone: '0821234567', vehicleMake: 'Toyota', licensePlate: 'CA 123-456' },
        expectedField: 'vehicleModel',
      },
      {
        body: { fullName: 'John Doe', email: 'driver5@example.com', phone: '0821234567', vehicleMake: 'Toyota', vehicleModel: 'Corolla' },
        expectedField: 'licensePlate',
      },
    ];

    for (const tc of testCases) {
      const req = createMockPostRequest(tc.body, { 'x-admin-passcode': MASTER_PASSCODE });

      const res = await registerDriverHandler(req);
      assert.strictEqual(res.status, 400, `Expected 400 when missing ${tc.expectedField}`);
      const json = await res.json();
      assert.strictEqual(json.field, tc.expectedField);
    }
  });

  test('successfully registers a driver with manager privileges and auto-verification', async () => {
    const uniqueId = Date.now().toString(36);
    const email = `manager.driver.${uniqueId}@soloride.co.za`;
    const phone = `+27 82 ${Math.floor(1000000 + Math.random() * 9000000)}`;
    const plate = `CA ${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;

    const req = createMockPostRequest(
      {
        fullName: 'Kagiso Rabada',
        email,
        phone,
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla Quest',
        vehicleYear: 2023,
        vehicleColor: 'Silver',
        licensePlate: plate,
        prdpNumber: `PRDP-${uniqueId.toUpperCase()}`,
        isVerified: true,
        subscriptionPlan: 'trial',
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const res = await registerDriverHandler(req);
    assert.strictEqual(res.status, 200, 'Registration by manager should succeed with HTTP 200');
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.driver.fullName, 'Kagiso Rabada');
    assert.strictEqual(json.driver.email, email);
    assert.strictEqual(json.driver.isVerified, true, 'Manager-registered driver should be marked verified');
    assert.ok(json.temporaryPassword, 'A secure initial password should be generated and returned');
    assert.ok(json.temporaryPassword.length >= 6, 'Generated password should have sufficient entropy');

    // Verify driver exists in kycStore
    const saved = getKycDriverProfile(json.driver.id);
    assert.ok(saved, 'Driver profile should be persisted in kycStore');
    assert.strictEqual(saved?.isVerified, true);
    assert.strictEqual(saved?.vehicleMake, 'Toyota');
    assert.strictEqual(saved?.licensePlate, plate.trim().toUpperCase());
  });

  test('rejects duplicate driver registration by email, phone, or license plate', async () => {
    const uniqueId = `dup_${Date.now().toString(36)}`;
    const email = `original.${uniqueId}@soloride.co.za`;
    const phone = `+27 83 999 0001`;
    const plate = `GP 999-001`;

    // 1. Initial registration
    const initialReq = createMockPostRequest(
      {
        fullName: 'Original Driver',
        email,
        phone,
        vehicleMake: 'Volkswagen',
        vehicleModel: 'Polo Sedan',
        licensePlate: plate,
        isVerified: true,
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const initialRes = await registerDriverHandler(initialReq);
    assert.strictEqual(initialRes.status, 200);

    // 2. Duplicate registration attempt with same email
    const dupEmailReq = createMockPostRequest(
      {
        fullName: 'Imposter Driver',
        email, // duplicate
        phone: '+27 84 888 7777',
        vehicleMake: 'Hyundai',
        vehicleModel: 'Grand i10',
        licensePlate: 'NW 555-666',
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const dupEmailRes = await registerDriverHandler(dupEmailReq);
    assert.strictEqual(dupEmailRes.status, 409, 'Duplicate email must be rejected with 409');
    const dupEmailJson = await dupEmailRes.json();
    assert.strictEqual(dupEmailJson.code, 'DUPLICATE_REGISTRATION');
    assert.strictEqual(dupEmailJson.field, 'email');

    // 3. Duplicate registration attempt with same phone
    const dupPhoneReq = createMockPostRequest(
      {
        fullName: 'Imposter Driver 2',
        email: `new.${uniqueId}@soloride.co.za`,
        phone, // duplicate
        vehicleMake: 'Hyundai',
        vehicleModel: 'Grand i10',
        licensePlate: 'NW 555-777',
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const dupPhoneRes = await registerDriverHandler(dupPhoneReq);
    assert.strictEqual(dupPhoneRes.status, 409, 'Duplicate phone must be rejected with 409');
    const dupPhoneJson = await dupPhoneRes.json();
    assert.strictEqual(dupPhoneJson.code, 'DUPLICATE_REGISTRATION');
    assert.strictEqual(dupPhoneJson.field, 'phone');

    // 4. Duplicate registration attempt with same license plate
    const dupPlateReq = createMockPostRequest(
      {
        fullName: 'Imposter Driver 3',
        email: `another.${uniqueId}@soloride.co.za`,
        phone: '+27 84 111 2233',
        vehicleMake: 'Nissan',
        vehicleModel: 'Almera',
        licensePlate: plate, // duplicate
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const dupPlateRes = await registerDriverHandler(dupPlateReq);
    assert.strictEqual(dupPlateRes.status, 409, 'Duplicate license plate must be rejected with 409');
    const dupPlateJson = await dupPlateRes.json();
    assert.strictEqual(dupPlateJson.code, 'DUPLICATE_REGISTRATION');
    assert.strictEqual(dupPlateJson.field, 'licensePlate');
  });

  test('allows custom password if specified with minimum 6 characters', async () => {
    const uniqueId = Date.now().toString(36);
    const email = `custom.pass.${uniqueId}@soloride.co.za`;

    const req = createMockPostRequest(
      {
        fullName: 'David Miller',
        email,
        phone: `+27 71 ${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'CustomDriverPass2026!',
        vehicleMake: 'Suzuki',
        vehicleModel: 'Dzire',
        licensePlate: `FS ${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`,
        isVerified: true,
      },
      { 'x-admin-passcode': MASTER_PASSCODE }
    );

    const res = await registerDriverHandler(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.temporaryPassword, 'CustomDriverPass2026!');
  });
});
