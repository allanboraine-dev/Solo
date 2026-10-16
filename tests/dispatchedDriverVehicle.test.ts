import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Dispatched Driver & Vehicle Verification Suite', () => {
  const rootDir = process.cwd();

  it('validates mockBackend exports getDriverProfileById to look up vehicle make, model, and plate', () => {
    const backendPath = path.join(rootDir, 'src', 'lib', 'mockBackend.ts');
    const backendCode = fs.readFileSync(backendPath, 'utf8');

    assert.ok(
      backendCode.includes('export const getDriverProfileById = async'),
      'mockBackend must export getDriverProfileById'
    );
    assert.ok(
      backendCode.includes('vehicle_make') && backendCode.includes('vehicle_model') && backendCode.includes('license_plate'),
      'getDriverProfileById must map vehicle_make, vehicle_model, and license_plate'
    );
  });

  it('validates Rider page source includes vehicle model and license plate card for dispatched trips', () => {
    const riderPath = path.join(rootDir, 'src', 'app', 'rider', 'page.tsx');
    const riderCode = fs.readFileSync(riderPath, 'utf8');

    // Asserts vehicle & license plate state and display
    assert.ok(
      riderCode.includes('assignedDriverInfo'),
      'Rider page must track assignedDriverInfo state'
    );
    assert.ok(
      riderCode.includes('licensePlate'),
      'Rider page must render driver licensePlate'
    );
    assert.ok(
      riderCode.includes('vehicleMake') || riderCode.includes('vehicleModel'),
      'Rider page must render vehicle make and model'
    );
    assert.ok(
      riderCode.includes('Verify plate before boarding'),
      'Rider page must include passenger safety notice to verify number plate'
    );
    assert.ok(
      riderCode.includes('🇿🇦'),
      'Rider page must render South African flag indicator next to plate'
    );
  });

  it('validates MapComponent includes license plate and vehicle in assigned driver popup', () => {
    const mapPath = path.join(rootDir, 'src', 'components', 'MapComponent.tsx');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    assert.ok(
      mapCode.includes('assignedDriver?.licensePlate'),
      'MapComponent popup must display assignedDriver licensePlate'
    );
    assert.ok(
      mapCode.includes('licensePlate?: string'),
      'MapComponent MapProps must accept licensePlate on assignedDriver'
    );
  });
});
