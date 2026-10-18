import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Rider Online Drivers View & Vehicle Info Suite', () => {
  const rootDir = process.cwd();

  it('validates mockBackend exports LiveDriver with driver and vehicle telematics', () => {
    const backendPath = path.join(rootDir, 'src', 'lib', 'mockBackend.ts');
    const backendCode = fs.readFileSync(backendPath, 'utf8');

    assert.ok(backendCode.includes('export type LiveDriver = {'), 'mockBackend must export LiveDriver type');
    assert.ok(backendCode.includes('fullName: string'), 'LiveDriver must include fullName');
    assert.ok(backendCode.includes('vehicleMake?: string'), 'LiveDriver must include vehicleMake');
    assert.ok(backendCode.includes('vehicleModel?: string'), 'LiveDriver must include vehicleModel');
    assert.ok(backendCode.includes('vehicleYear?: number'), 'LiveDriver must include vehicleYear');
    assert.ok(backendCode.includes('vehicleColor?: string'), 'LiveDriver must include vehicleColor');
    assert.ok(backendCode.includes('licensePlate?: string'), 'LiveDriver must include licensePlate');
    assert.ok(backendCode.includes('rating?: number'), 'LiveDriver must include rating');
    assert.ok(backendCode.includes('distanceKm?: number'), 'LiveDriver must include distanceKm');
    assert.ok(backendCode.includes('etaMinutes?: number'), 'LiveDriver must include etaMinutes');
  });

  it('validates getActiveDrivers maps vehicle make, model, color, year, license plate and rating', () => {
    const backendPath = path.join(rootDir, 'src', 'lib', 'mockBackend.ts');
    const backendCode = fs.readFileSync(backendPath, 'utf8');

    assert.ok(backendCode.includes('export const getActiveDrivers = async'), 'must export getActiveDrivers');
    assert.ok(backendCode.includes('vehicle_make') && backendCode.includes('vehicle_model'), 'must query vehicle_make and vehicle_model');
    assert.ok(backendCode.includes('license_plate'), 'must query license_plate');
    assert.ok(backendCode.includes('rating_avg'), 'must query rating_avg');
  });

  it('validates OnlineDriversModal component exists and displays driver & car information', () => {
    const modalPath = path.join(rootDir, 'src', 'components', 'OnlineDriversModal.tsx');
    assert.ok(fs.existsSync(modalPath), 'OnlineDriversModal.tsx must exist');

    const modalCode = fs.readFileSync(modalPath, 'utf8');
    assert.ok(modalCode.includes('Drivers Online'), 'must display Drivers Online header');
    assert.ok(modalCode.includes('driver.fullName'), 'must render driver name');
    assert.ok(modalCode.includes('driver.vehicleMake') && modalCode.includes('driver.vehicleModel'), 'must render vehicle make and model');
    assert.ok(modalCode.includes('driver.licensePlate'), 'must render license plate');
    assert.ok(modalCode.includes('🇿🇦'), 'must display South African flag badge next to plate');
    assert.ok(modalCode.includes('driver.distanceKm'), 'must render distance telematics');
    assert.ok(modalCode.includes('driver.rating'), 'must render driver rating');
    assert.ok(modalCode.includes('View on Map'), 'must provide View on Map action');
  });

  it('validates BookingForm presents online drivers section with vehicle and driver info', () => {
    const formPath = path.join(rootDir, 'src', 'components', 'BookingForm.tsx');
    const formCode = fs.readFileSync(formPath, 'utf8');

    assert.ok(formCode.includes('availableDrivers'), 'BookingForm must accept availableDrivers prop');
    assert.ok(formCode.includes('Drivers Online'), 'BookingForm must display Drivers Online section');
    assert.ok(formCode.includes('driver.licensePlate'), 'BookingForm must display driver licensePlate');
    assert.ok(formCode.includes('vehicleMake') || formCode.includes('vehicleModel'), 'BookingForm must display vehicle model');
    assert.ok(formCode.includes('onViewAllDrivers'), 'BookingForm must support onViewAllDrivers');
    assert.ok(formCode.includes('🇿🇦'), 'BookingForm must display SA flag badge on plates');
  });

  it('validates RiderPage integrates OnlineDriversModal and interactive online drivers button', () => {
    const riderPath = path.join(rootDir, 'src', 'app', 'rider', 'page.tsx');
    const riderCode = fs.readFileSync(riderPath, 'utf8');

    assert.ok(riderCode.includes('OnlineDriversModal'), 'RiderPage must import OnlineDriversModal');
    assert.ok(riderCode.includes('showDriversModal'), 'RiderPage must track showDriversModal state');
    assert.ok(riderCode.includes('setShowDriversModal(true)'), 'RiderPage must have trigger to open drivers modal');
    assert.ok(riderCode.includes('handleLocateDriverOnMap'), 'RiderPage must provide handleLocateDriverOnMap');
    assert.ok(riderCode.includes('focusedDriverCoords'), 'RiderPage must track focusedDriverCoords for map zoom');
  });

  it('validates MapComponent displays complete car and driver info on available driver marker popups', () => {
    const mapPath = path.join(rootDir, 'src', 'components', 'MapComponent.tsx');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    assert.ok(mapCode.includes('DriverMarkerData'), 'MapComponent must export DriverMarkerData');
    assert.ok(mapCode.includes('focusedDriverCoords'), 'MapComponent must accept focusedDriverCoords');
    assert.ok(mapCode.includes('driver.licensePlate'), 'MapComponent must display license plate in available driver popup');
    assert.ok(mapCode.includes('driver.rating'), 'MapComponent must display star rating in available driver popup');
    assert.ok(mapCode.includes('vehicleTitle') || mapCode.includes('driver.vehicle'), 'MapComponent must display vehicle name in available driver popup');
    assert.ok(mapCode.includes('🇿🇦'), 'MapComponent popup must show SA flag badge');
    assert.ok(mapCode.includes('flyTo'), 'MapComponent must flyTo focused driver coordinates');
  });
});
