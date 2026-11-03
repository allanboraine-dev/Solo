import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { calculateFleetMonthlyBilling } from '../src/utils/fleetStore.ts';
import robots from '../src/app/robots.ts';
import sitemap from '../src/app/sitemap.ts';

describe('Fleet Form, SEO Metadata, and Security Validation Suite', () => {
  test('substantiates fleet monthly savings against legacy 25% commission benchmark', () => {
    // Single vehicle fleet test
    const singleCar = calculateFleetMonthlyBilling(1);
    assert.strictEqual(singleCar.basePlatformFeeZar, 770);
    assert.strictEqual(singleCar.perVehicleZar, 499);
    assert.strictEqual(singleCar.benchmarkGrossPerVehicleZar, 25000);
    assert.strictEqual(singleCar.legacyTakeRatePercent, 25);
    assert.strictEqual(singleCar.benchmarkLegacyCommissionZar, 6250);
    assert.ok(singleCar.savingsVsUberBoltZar > 4000);

    // 5 vehicle fleet test
    const fiveCars = calculateFleetMonthlyBilling(5);
    assert.strictEqual(fiveCars.benchmarkLegacyCommissionZar, 6250 * 5); // 31250
    assert.ok(fiveCars.savingsVsUberBoltZar > 25000);
  });

  test('validates crawl directives in src/app/robots.ts', () => {
    const robotRules = robots();
    assert.ok(robotRules.rules);
    const rules = Array.isArray(robotRules.rules) ? robotRules.rules[0] : robotRules.rules;
    assert.strictEqual(rules.userAgent, '*');
    assert.ok(Array.isArray(rules.allow));
    assert.ok(rules.allow.includes('/'));
    assert.ok(rules.allow.includes('/fleet'));
    assert.ok(rules.allow.includes('/driver'));
    assert.ok(rules.allow.includes('/rider'));
    assert.ok(rules.allow.includes('/manual'));
    assert.ok(rules.allow.includes('/privacy'));
    assert.ok(Array.isArray(rules.disallow));
    assert.ok(rules.disallow.includes('/admin/'));
    assert.ok(rules.disallow.includes('/api/'));
    assert.ok(robotRules.sitemap?.includes('sitemap.xml'));
  });

  test('validates sitemap generation for public discovery routes', () => {
    const urls = sitemap();
    assert.ok(Array.isArray(urls));
    assert.ok(urls.length >= 8);

    const routes = urls.map((u) => new URL(u.url).pathname);
    assert.ok(routes.includes('/'));
    assert.ok(routes.includes('/rider'));
    assert.ok(routes.includes('/driver'));
    assert.ok(routes.includes('/driver/register'));
    assert.ok(routes.includes('/driver/login'));
    assert.ok(routes.includes('/fleet'));
    assert.ok(routes.includes('/manual'));
    assert.ok(routes.includes('/privacy'));
    assert.ok(routes.includes('/lost-phone'));

    for (const item of urls) {
      assert.ok(item.priority && item.priority > 0 && item.priority <= 1.0);
      assert.ok(item.changeFrequency);
      assert.ok(item.lastModified);
    }
  });

  test('verifies security headers and CSP directives in next.config.mjs', () => {
    const configContent = fs.readFileSync(path.resolve('next.config.mjs'), 'utf8');
    assert.ok(configContent.includes('Content-Security-Policy'));
    assert.ok(configContent.includes('Permissions-Policy'));
    assert.ok(configContent.includes('strict-origin-when-cross-origin'));
    assert.ok(configContent.includes('api.mapbox.com'));
    assert.ok(configContent.includes('tile.openstreetmap.org'));
    assert.ok(configContent.includes('api.paystack.co'));
    assert.ok(configContent.includes('supabase.co'));
  });

  test('verifies accessibility attributes, labels, and POPIA consent in forms', () => {
    const fleetPage = fs.readFileSync(path.resolve('src/app/fleet/page.tsx'), 'utf8');
    assert.ok(fleetPage.includes('htmlFor="fleet-reg-company-name"'));
    assert.ok(fleetPage.includes('id="fleet-reg-company-name"'));
    assert.ok(fleetPage.includes('htmlFor="fleet-reg-contact-person"'));
    assert.ok(fleetPage.includes('id="fleet-reg-contact-person"'));
    assert.ok(fleetPage.includes('htmlFor="fleet-reg-email"'));
    assert.ok(fleetPage.includes('id="fleet-reg-email"'));
    assert.ok(fleetPage.includes('htmlFor="fleet-reg-popia-consent"'));
    assert.ok(fleetPage.includes('id="fleet-reg-popia-consent"'));
    assert.ok(fleetPage.includes('POPIA Privacy Policy'));
    assert.ok(fleetPage.includes('role="alert"'));
    assert.ok(fleetPage.includes('id="fleet-reg-error"'));

    const driverRegPage = fs.readFileSync(path.resolve('src/app/driver/register/page.tsx'), 'utf8');
    assert.ok(driverRegPage.includes('htmlFor="driver-reg-fullname"'));
    assert.ok(driverRegPage.includes('id="driver-reg-fullname"'));
    assert.ok(driverRegPage.includes('htmlFor="driver-reg-email"'));
    assert.ok(driverRegPage.includes('id="driver-reg-email"'));
    assert.ok(driverRegPage.includes('id="driver-reg-error"'));

    const driverLoginPage = fs.readFileSync(path.resolve('src/app/driver/login/page.tsx'), 'utf8');
    assert.ok(driverLoginPage.includes('htmlFor="driver-login-email"'));
    assert.ok(driverLoginPage.includes('id="driver-login-email"'));
    assert.ok(driverLoginPage.includes('htmlFor="driver-login-password"'));
    assert.ok(driverLoginPage.includes('id="driver-login-password"'));
    assert.ok(driverLoginPage.includes('id="driver-login-error"'));
    assert.ok(driverLoginPage.includes('href="/privacy"'));

    const homePage = fs.readFileSync(path.resolve('src/app/page.tsx'), 'utf8');
    assert.ok(homePage.includes('href="/privacy"'));
    assert.ok(homePage.includes('loading="lazy"'));
    assert.ok(homePage.includes('fetchPriority="high"'));

    const riderPage = fs.readFileSync(path.resolve('src/app/rider/page.tsx'), 'utf8');
    assert.ok(riderPage.includes('href="/privacy"'));
  });

  test('verifies MapComponent tileerror failover and visibilitychange handling', () => {
    const mapCode = fs.readFileSync(path.resolve('src/components/MapComponent.tsx'), 'utf8');
    assert.ok(mapCode.includes('useOsmFallback'));
    assert.ok(mapCode.includes('tileerror'));
    assert.ok(mapCode.includes('openstreetmap.org'));
    assert.ok(mapCode.includes('visibilitychange'));
    assert.ok(mapCode.includes('orientationchange'));
    assert.ok(mapCode.includes('map.invalidateSize()'));
  });
});
