import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Driver PIN Verification & Arrival Confirmation Suite', () => {
  const rootDir = process.cwd();

  it('validates mockBackend implements startTripWithPin and verification_pin enrichment', () => {
    const backendPath = path.join(rootDir, 'src', 'lib', 'mockBackend.ts');
    const backendCode = fs.readFileSync(backendPath, 'utf8');

    assert.ok(
      backendCode.includes('export const startTripWithPin = async'),
      'mockBackend must export startTripWithPin'
    );
    assert.ok(
      backendCode.includes('verification_pin: trip.verification_pin || Math.floor(1000 + Math.random() * 9000).toString()'),
      'saveTrip must ensure a 4-digit verification_pin is generated and attached'
    );
    assert.ok(
      backendCode.includes('Invalid verification PIN'),
      'startTripWithPin must validate and return error for invalid PIN'
    );
    assert.ok(
      backendCode.includes("status: 'in_progress'"),
      'startTripWithPin must transition trip to in_progress upon success'
    );
  });

  it('validates Driver page source renders the Rider Boarding PIN card', () => {
    const driverPagePath = path.join(rootDir, 'src', 'app', 'driver', 'page.tsx');
    const driverCode = fs.readFileSync(driverPagePath, 'utf8');

    assert.ok(
      driverCode.includes('activeTrip.verification_pin'),
      'Driver page must display activeTrip.verification_pin'
    );
    assert.ok(
      driverCode.includes('Boarding PIN'),
      'Driver page must feature a Boarding PIN card'
    );
    assert.ok(
      driverCode.includes('Confirm with Rider'),
      'Driver page must clearly indicate that PIN must be confirmed with the rider'
    );
    assert.ok(
      driverCode.includes('KeyRound'),
      'Driver page must utilize KeyRound icon for PIN identification'
    );
  });

  it('validates Driver page source includes arrival and PIN verification handlers', () => {
    const driverPagePath = path.join(rootDir, 'src', 'app', 'driver', 'page.tsx');
    const driverCode = fs.readFileSync(driverPagePath, 'utf8');

    assert.ok(
      driverCode.includes('handleDriverArrived'),
      'Driver page must implement handleDriverArrived'
    );
    assert.ok(
      driverCode.includes('handleVerifyPinAndStart'),
      'Driver page must implement handleVerifyPinAndStart'
    );
    assert.ok(
      driverCode.includes('I Have Arrived at Pickup'),
      'Driver page must render button for arriving at pickup'
    );
    assert.ok(
      driverCode.includes('Start Trip') && (driverCode.includes('Verify PIN') || driverCode.includes('Confirm PIN')),
      'Driver page must render button to verify PIN and start trip'
    );
    assert.ok(
      driverCode.includes('dispatchDriverArrivedPush'),
      'Driver arrival must dispatch arrival push notification to rider'
    );
  });

  it('validates Driver page source includes PIN verification modal dialog', () => {
    const driverPagePath = path.join(rootDir, 'src', 'app', 'driver', 'page.tsx');
    const driverCode = fs.readFileSync(driverPagePath, 'utf8');

    assert.ok(
      driverCode.includes('showPinModal'),
      'Driver page must manage showPinModal state'
    );
    assert.ok(
      driverCode.includes('Verify Boarding PIN'),
      'Driver page modal must include Verify Boarding PIN header'
    );
    assert.ok(
      driverCode.includes('pinInput'),
      'Driver page must manage pinInput state'
    );
    assert.ok(
      driverCode.includes('pinError'),
      'Driver page must display pinError feedback'
    );
    assert.ok(
      driverCode.includes('Quick Fill Assigned PIN'),
      'Driver page modal must provide quick fill option for assigned PIN'
    );
  });

  it('validates Rider page source includes arrival status and boarding PIN alert', () => {
    const riderPagePath = path.join(rootDir, 'src', 'app', 'rider', 'page.tsx');
    const riderCode = fs.readFileSync(riderPagePath, 'utf8');

    assert.ok(
      riderCode.includes("activeTrip.status === 'arrived'"),
      'Rider page must handle arrived trip status'
    );
    assert.ok(
      riderCode.includes('Your driver has arrived!'),
      'Rider page must display arrival status text to rider'
    );
    assert.ok(
      riderCode.includes('Driver is waiting outside. Share PIN to board:'),
      'Rider page must display arrival alert instructing rider to share PIN'
    );
    assert.ok(
      riderCode.includes('Your Driver Has Arrived! 📍'),
      'Rider page must dispatch native browser notification on driver arrival'
    );
  });

  it('validates pushClient exports dispatchDriverArrivedPush with OTP PIN', () => {
    const pushClientPath = path.join(rootDir, 'src', 'utils', 'pushClient.ts');
    const pushCode = fs.readFileSync(pushClientPath, 'utf8');

    assert.ok(
      pushCode.includes('export async function dispatchDriverArrivedPush'),
      'pushClient must export dispatchDriverArrivedPush'
    );
    assert.ok(
      pushCode.includes('Your Driver Has Arrived! 📍'),
      'dispatchDriverArrivedPush must use appropriate arrival title'
    );
    assert.ok(
      pushCode.includes('otpPin'),
      'dispatchDriverArrivedPush must include otpPin in signature'
    );
    assert.ok(
      pushCode.includes('Share PIN ${params.otpPin} to start trip'),
      'dispatchDriverArrivedPush notification body must include trip PIN'
    );
  });
});
