import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  calculateFleetMonthlyBilling,
  checkComplianceExpiry,
  saveFleetProfile,
  getFleetProfile,
  saveFleetVehicle,
  getFleetVehicles,
  deleteFleetVehicle,
  assignDriverToVehicle,
  unassignDriverFromVehicle,
  toggleVehicleDispatchSuspension,
  recordFleetShiftAudit,
  getFleetShiftAudits,
  checkVehicleFleetCoverage,
  registerFleetProfile,
  loginFleetProfile,
  getActiveFleetProfile,
  setActiveFleetSession,
  clearActiveFleetSession,
  activateFleetSubscription,
  seedDefaultFleetIfNeeded,
  resetDemoFleet,
  recordCompletedTripToFleetAudit,
  FLEET_PRICING,
} from '../src/utils/fleetStore.ts';
import type { FleetProfile, FleetVehicle, FleetShiftAudit } from '../src/types/fleet.ts';

describe('SOLO B2B Fleet Management & Pricing Suite', () => {
  const testFleetId = 'test-fleet-jhb';

  beforeEach(() => {
    // Setup clean test fleet profile
    const testProfile: FleetProfile = {
      id: testFleetId,
      ownerEmail: 'owner@jhbfleet.co.za',
      ownerPhone: '+27 82 111 2233',
      companyName: 'Gauteng Fleet Partners (Pty) Ltd',
      registrationNumber: '2023/123456/07',
      vatNumber: '4991238910',
      contactPerson: 'Kagiso Molefe',
      operatingCity: 'Johannesburg',
      subscriptionStatus: 'active',
      subscriptionTier: 'fleet_starter',
      activeVehiclesCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveFleetProfile(testProfile);
  });

  it('calculates Option C fleet billing (R770/mo Base Hub License + R499/vehicle dispatch + 15% VAT)', () => {
    // 1 vehicle
    const calc1 = calculateFleetMonthlyBilling(1);
    assert.strictEqual(calc1.vehicleCount, 1);
    assert.strictEqual(calc1.basePlatformFeeZar, 770);
    assert.strictEqual(calc1.perVehicleZar, 499);
    assert.strictEqual(calc1.vehiclesSubtotalZar, 499);
    assert.strictEqual(calc1.subtotalZar, 1269); // 770 + 499
    assert.strictEqual(calc1.vatAmountZar, 190.35); // 1269 * 0.15
    assert.strictEqual(calc1.totalMonthlyZar, 1459.35);

    // 3 vehicles
    const calc3 = calculateFleetMonthlyBilling(3);
    assert.strictEqual(calc3.vehicleCount, 3);
    assert.strictEqual(calc3.basePlatformFeeZar, 770);
    assert.strictEqual(calc3.vehiclesSubtotalZar, 1497); // 3 * 499
    assert.strictEqual(calc3.subtotalZar, 2267); // 770 + 1497
    assert.strictEqual(calc3.vatAmountZar, 340.05); // 2267 * 0.15
    assert.strictEqual(calc3.totalMonthlyZar, 2607.05);
    // Uber/Bolt Benchmark: 3 cars * R6,250 = R18,750. Savings: > R16,000/mo
    assert.ok(calc3.savingsVsUberBoltZar > 16000);

    // 10 vehicles
    const calc10 = calculateFleetMonthlyBilling(10);
    assert.strictEqual(calc10.vehicleCount, 10);
    assert.strictEqual(calc10.vehiclesSubtotalZar, 4990); // 10 * 499
    assert.strictEqual(calc10.subtotalZar, 5760); // 770 + 4990
    assert.strictEqual(calc10.vatAmountZar, 864.00); // 5760 * 0.15
    assert.strictEqual(calc10.totalMonthlyZar, 6624.00);
    // Uber/Bolt on 10 cars: R62,500/mo. Savings: > R55,000/mo
    assert.ok(calc10.savingsVsUberBoltZar > 55000);
  });

  it('correctly evaluates statutory compliance expiry (CoF & License Disc)', () => {
    const now = new Date();
    
    // Future date (>30 days) -> valid
    const validDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const validRes = checkComplianceExpiry(validDate);
    assert.strictEqual(validRes.status, 'valid');
    assert.ok(validRes.daysRemaining! > 30);

    // Near date (<=30 days) -> expiring_soon
    const nearDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const nearRes = checkComplianceExpiry(nearDate);
    assert.strictEqual(nearRes.status, 'expiring_soon');
    assert.ok(nearRes.daysRemaining! <= 30 && nearRes.daysRemaining! > 0);

    // Past date -> expired
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pastRes = checkComplianceExpiry(pastDate);
    assert.strictEqual(pastRes.status, 'expired');
    assert.ok(pastRes.daysRemaining! < 0);

    // Missing date
    const missingRes = checkComplianceExpiry(null);
    assert.strictEqual(missingRes.status, 'missing');
  });

  it('manages vehicle inventory, driver pairing, and shift assignments', () => {
    const vehicle: FleetVehicle = {
      id: 'test-veh-01',
      fleetId: testFleetId,
      make: 'Suzuki',
      model: 'Dzire 1.2 GL',
      year: 2023,
      color: 'Silver',
      licensePlate: 'ND 883-291',
      speedpointType: 'yoco',
      speedpointTerminalId: 'YOCO-TEST-01',
      currentStatus: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveFleetVehicle(vehicle);
    const list = getFleetVehicles(testFleetId);
    assert.strictEqual(list.length >= 1, true);

    // Assign Driver to Vehicle with Day Shift
    const assigned = assignDriverToVehicle(testFleetId, vehicle.id, {
      id: 'driver-kagiso-01',
      name: 'Kagiso Dladla',
      phone: '+27 82 999 8877',
      shiftType: 'day_shift',
      rentalRateWeeklyZar: 2300,
    });

    assert.ok(assigned);
    assert.strictEqual(assigned?.assignedDriverName, 'Kagiso Dladla');
    assert.strictEqual(assigned?.shiftType, 'day_shift');
    assert.strictEqual(assigned?.rentalRateWeeklyZar, 2300);
    assert.strictEqual(assigned?.currentStatus, 'online');

    // Verify Driver Fleet Coverage bypasses individual driver Paystack paywall
    const coverage = checkVehicleFleetCoverage({ driverId: 'driver-kagiso-01' });
    assert.strictEqual(coverage.isCovered, true);
    assert.strictEqual(coverage.fleetName, 'Gauteng Fleet Partners (Pty) Ltd');
    assert.strictEqual(coverage.dispatchSuspended, false);

    // Unassign Driver
    const unassigned = unassignDriverFromVehicle(testFleetId, vehicle.id);
    assert.strictEqual(unassigned?.assignedDriverId, null);
    assert.strictEqual(unassigned?.currentStatus, 'idle');
  });

  it('allows fleet owner to toggle remote dispatch suspension for rental arrears', () => {
    const vehicle: FleetVehicle = {
      id: 'test-veh-suspension',
      fleetId: testFleetId,
      make: 'Toyota',
      model: 'Corolla Quest',
      year: 2022,
      color: 'White',
      licensePlate: 'GP 992-100',
      assignedDriverId: 'driver-arrears-01',
      assignedDriverName: 'Sipho Default',
      speedpointType: 'ikhokha',
      currentStatus: 'online',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveFleetVehicle(vehicle);

    // Toggle dispatch suspension
    const suspended = toggleVehicleDispatchSuspension(
      testFleetId,
      vehicle.id,
      true,
      'Weekly vehicle rental in arrears (R2,400 overdue)'
    );

    assert.strictEqual(suspended?.dispatchSuspended, true);
    assert.strictEqual(suspended?.currentStatus, 'suspended');
    assert.ok(suspended?.notes?.includes('overdue'));

    // Verify driver dispatch is blocked
    const coverage = checkVehicleFleetCoverage({ licensePlate: 'GP 992-100' });
    assert.strictEqual(coverage.isCovered, false);
    assert.strictEqual(coverage.dispatchSuspended, true);
    assert.ok(coverage.reason?.includes('overdue'));

    // Resume dispatch
    const resumed = toggleVehicleDispatchSuspension(testFleetId, vehicle.id, false);
    assert.strictEqual(resumed?.dispatchSuspended, false);
    const resumedCoverage = checkVehicleFleetCoverage({ licensePlate: 'GP 992-100' });
    assert.strictEqual(resumedCoverage.isCovered, true);
  });

  it('records and retrieves shift audits for daily cash and speedpoint reconciliation', () => {
    const audit: FleetShiftAudit = {
      id: 'audit-test-01',
      fleetId: testFleetId,
      vehicleId: 'test-veh-01',
      licensePlate: 'ND 883-291',
      driverId: 'driver-test-01',
      driverName: 'Thabo Tester',
      shiftDate: '2026-10-22',
      tripsCompleted: 15,
      totalGrossZar: 2100,
      cashCollectedZar: 700,
      speedpointCollectedZar: 1400,
      distanceKm: 185.2,
      shiftHours: 10.0,
      rentalTargetZar: 480,
      settlementStatus: 'settled',
      createdAt: new Date().toISOString(),
    };

    const recorded = recordFleetShiftAudit(audit);
    assert.strictEqual(recorded.id, 'audit-test-01');

    const audits = getFleetShiftAudits(testFleetId);
    const found = audits.find((a) => a.id === 'audit-test-01');
    assert.ok(found);
    assert.strictEqual(found?.totalGrossZar, 2100);
    assert.strictEqual(found?.cashCollectedZar, 700);
    assert.strictEqual(found?.speedpointCollectedZar, 1400);
    assert.strictEqual(found?.settlementStatus, 'settled');
  });

  it('registers a new fleet partner and establishes an active fleet session', () => {
    clearActiveFleetSession();
    assert.strictEqual(getActiveFleetProfile(), null);

    const registered = registerFleetProfile({
      companyName: 'Cape Peninsula Trans (Pty) Ltd',
      contactPerson: 'Zola Matshoba',
      ownerEmail: 'zola@peninsulatrans.co.za',
      ownerPhone: '+27 72 333 4455',
      operatingCity: 'Cape Town',
      registrationNumber: '2024/987654/07',
      vatNumber: '4882736451',
      estimatedVehicles: 6,
    });

    assert.ok(registered.id);
    assert.strictEqual(registered.companyName, 'Cape Peninsula Trans (Pty) Ltd');
    // Under Approach 2: Free onboarding setup with 7-day free fleet trial
    assert.strictEqual(registered.subscriptionStatus, 'trial');
    assert.ok(registered.trialEndsAt);
    const diffDays = Math.round((new Date(registered.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 7, 'Fleet subscription must initialize with a 7-day free trial');
    assert.strictEqual(registered.subscriptionTier, 'fleet_pro'); // 6 vehicles = fleet_pro

    // Verify session was automatically set
    const active = getActiveFleetProfile();
    assert.ok(active);
    assert.strictEqual(active?.id, registered.id);
    assert.strictEqual(active?.companyName, 'Cape Peninsula Trans (Pty) Ltd');

    // Activate subscription via Paystack
    const activated = activateFleetSubscription(registered.id, {
      paymentReference: 'PAYSTACK-FLEET-TEST-001',
      amountZar: 4327.45,
      cardLast4: '4242',
      cardBrand: 'visa',
    });
    assert.strictEqual(activated?.subscriptionStatus, 'active');
    assert.strictEqual(activated?.lastPaymentReference, 'PAYSTACK-FLEET-TEST-001');
    assert.strictEqual(activated?.lastPaymentAmountZar, 4327.45);
    assert.strictEqual(activated?.cardLast4, '4242');

    // Sign out / Clear session
    clearActiveFleetSession();
    assert.strictEqual(getActiveFleetProfile(), null);

    // Sign in via email
    const loggedIn = loginFleetProfile('zola@peninsulatrans.co.za');
    assert.ok(loggedIn);
    assert.strictEqual(loggedIn?.id, registered.id);
    assert.strictEqual(loggedIn?.subscriptionStatus, 'active');
    assert.strictEqual(getActiveFleetProfile()?.id, registered.id);

    // Sign in via phone number
    clearActiveFleetSession();
    const loggedInPhone = loginFleetProfile('+27 72 333 4455');
    assert.ok(loggedInPhone);
    assert.strictEqual(loggedInPhone?.id, registered.id);
  });

  it('resets demo fleet back to initial clean state and clears vehicles/audits that were just added', () => {
    // 1. Initialize demo fleet
    const demo = seedDefaultFleetIfNeeded(true);
    assert.strictEqual(demo.id, 'fleet-apex-capetown');
    assert.strictEqual(getFleetVehicles(demo.id).length, 3);
    assert.strictEqual(getFleetShiftAudits(demo.id).length, 2);

    // 2. Simulate user adding a temporary vehicle to demo fleet
    const tempVehicle: FleetVehicle = {
      id: 'veh-demo-temp-999',
      fleetId: demo.id,
      make: 'Hyundai',
      model: 'Grand i10',
      year: 2024,
      color: 'Phantom Black',
      licensePlate: 'CA 999-000',
      currentStatus: 'idle',
      dispatchSuspended: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveFleetVehicle(tempVehicle);
    assert.strictEqual(getFleetVehicles(demo.id).length, 4);

    // 3. Simulate user adding an extra shift audit to demo fleet
    const tempAudit: FleetShiftAudit = {
      id: 'audit-demo-temp-999',
      fleetId: demo.id,
      vehicleId: 'veh-demo-temp-999',
      licensePlate: 'CA 999-000',
      driverId: 'driver-temp',
      driverName: 'Temp Driver',
      shiftDate: '2026-10-22',
      tripsCompleted: 5,
      totalGrossZar: 600,
      cashCollectedZar: 200,
      speedpointCollectedZar: 400,
      settlementStatus: 'settled',
      createdAt: new Date().toISOString(),
    };
    recordFleetShiftAudit(tempAudit);
    assert.strictEqual(getFleetShiftAudits(demo.id).length, 3);

    // 4. Trigger reset function
    const resetResult = resetDemoFleet();
    assert.strictEqual(resetResult.id, 'fleet-apex-capetown');

    // 5. Verify demo fleet is restored to original clean state with extra items cleared
    const vehiclesAfterReset = getFleetVehicles(demo.id);
    const auditsAfterReset = getFleetShiftAudits(demo.id);
    assert.strictEqual(vehiclesAfterReset.length, 3);
    assert.strictEqual(auditsAfterReset.length, 2);
    assert.strictEqual(vehiclesAfterReset.some((v) => v.id === 'veh-demo-temp-999'), false);
    assert.strictEqual(auditsAfterReset.some((a) => a.id === 'audit-demo-temp-999'), false);
    assert.strictEqual(getActiveFleetProfile()?.id, demo.id);
  });

  it('automatically records completed trip earnings to the daily fleet audit for fleet manager visibility', () => {
    // 1. Initialize fleet and pair a driver to a vehicle
    const demo = seedDefaultFleetIfNeeded(true);
    const vehicle = getFleetVehicles(demo.id)[0]; // CA 892-149, driver Thabo Mthembu (driver-thabo-01)
    assert.ok(vehicle);

    const today = new Date().toISOString().slice(0, 10);
    const existingAuditsBefore = getFleetShiftAudits(demo.id, vehicle.id);
    const baselineTrips = existingAuditsBefore.find(a => a.shiftDate === today)?.tripsCompleted || 0;
    const baselineGross = existingAuditsBefore.find(a => a.shiftDate === today)?.totalGrossZar || 0;
    const baselineCash = existingAuditsBefore.find(a => a.shiftDate === today)?.cashCollectedZar || 0;

    // 2. Complete a cash trip (R85, 9.2 km)
    const audit1 = recordCompletedTripToFleetAudit({
      driverId: vehicle.assignedDriverId,
      licensePlate: vehicle.licensePlate,
      fareAmountZar: 85,
      paymentMethod: 'cash',
      distanceKm: 9.2,
    });

    assert.ok(audit1);
    assert.strictEqual(audit1?.tripsCompleted, baselineTrips + 1);
    assert.strictEqual(audit1?.totalGrossZar, baselineGross + 85);
    assert.strictEqual(audit1?.cashCollectedZar, baselineCash + 85);

    // 3. Complete a speedpoint card trip (R120, 14.5 km)
    const audit2 = recordCompletedTripToFleetAudit({
      driverId: vehicle.assignedDriverId,
      licensePlate: vehicle.licensePlate,
      fareAmountZar: 120,
      paymentMethod: 'in_app',
      distanceKm: 14.5,
    });

    assert.ok(audit2);
    assert.strictEqual(audit2?.tripsCompleted, baselineTrips + 2);
    assert.strictEqual(audit2?.totalGrossZar, baselineGross + 205);
    assert.strictEqual((audit2?.speedpointCollectedZar || 0) >= 120, true);

    // 4. Verify audits list has updated audit record accessible by fleet manager
    const auditsForFleet = getFleetShiftAudits(demo.id, vehicle.id);
    const todayAudit = auditsForFleet.find(a => a.shiftDate === today);
    assert.ok(todayAudit);
    assert.strictEqual(todayAudit?.totalGrossZar, baselineGross + 205);
  });
});
