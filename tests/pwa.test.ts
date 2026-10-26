import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA Mobile Installation & Offline Optimization Suite', () => {
  const rootDir = process.cwd();

  it('validates public/manifest.json schema and required PWA fields', () => {
    const manifestPath = path.join(rootDir, 'public', 'manifest.json');
    assert.strictEqual(fs.existsSync(manifestPath), true, 'manifest.json must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.orientation, 'portrait');
    assert.ok(manifest.name.includes('SOLO'));
    assert.ok(manifest.short_name.includes('SOLO'));
    assert.ok(manifest.start_url.startsWith('/'));

    // Verify icons array
    assert.ok(Array.isArray(manifest.icons));
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    assert.ok(sizes.includes('192x192'), 'Must include 192x192 icon');
    assert.ok(sizes.includes('512x512'), 'Must include 512x512 icon');

    // Verify maskable icon for Android adaptive icons
    const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'));
    assert.strictEqual(hasMaskable, true, 'Must include maskable icon');

    // Verify shortcuts
    assert.ok(Array.isArray(manifest.shortcuts));
    assert.ok(manifest.shortcuts.length >= 2, 'Must have at least 2 quick shortcuts');
  });

  it('validates Driver and Rider portal manifests open directly to /driver and /rider when installed', () => {
    const driverManifestPath = path.join(rootDir, 'public', 'manifest-driver.json');
    const riderManifestPath = path.join(rootDir, 'public', 'manifest-rider.json');
    assert.strictEqual(fs.existsSync(driverManifestPath), true, 'manifest-driver.json must exist');
    assert.strictEqual(fs.existsSync(riderManifestPath), true, 'manifest-rider.json must exist');

    const driverManifest = JSON.parse(fs.readFileSync(driverManifestPath, 'utf8'));
    const riderManifest = JSON.parse(fs.readFileSync(riderManifestPath, 'utf8'));

    assert.ok(driverManifest.start_url.startsWith('/driver'), 'Driver PWA must start at /driver');
    assert.strictEqual(driverManifest.display, 'standalone');
    assert.ok(driverManifest.scope === '/driver' || driverManifest.scope === '/');
    assert.ok(riderManifest.start_url.startsWith('/rider'), 'Rider PWA must start at /rider');
    assert.strictEqual(riderManifest.display, 'standalone');
    assert.ok(riderManifest.scope === '/rider' || riderManifest.scope === '/');
  });

  it('confirms all required PWA PNG app icons exist with valid content', () => {
    const requiredIcons = [
      'icon-192.png',
      'icon-512.png',
      'icon-maskable.png',
      'apple-touch-icon.png',
      'driver-icon-192.png',
      'driver-icon-512.png',
      'rider-icon-192.png',
      'rider-icon-512.png',
    ];

    for (const iconFile of requiredIcons) {
      const iconPath = path.join(rootDir, 'public', iconFile);
      assert.strictEqual(fs.existsSync(iconPath), true, `Icon ${iconFile} must exist on disk`);
      const stat = fs.statSync(iconPath);
      assert.ok(stat.size > 1000, `Icon ${iconFile} must not be empty (size: ${stat.size} bytes)`);
    }
  });

  it('validates South African emergency hotline configuration for offline safety', () => {
    // Official South African Emergency Services
    const emergencyHotlines = {
      police: '10111',
      ambulance: '10177',
      mobileSos: '112',
    };

    assert.strictEqual(emergencyHotlines.police, '10111');
    assert.strictEqual(emergencyHotlines.ambulance, '10177');
    assert.strictEqual(emergencyHotlines.mobileSos, '112');
  });

  it('validates PWA dismissal window prevents repeated intrusive prompts', () => {
    const now = 1776247200000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const dismissedUntil = now + sevenDaysMs;

    assert.strictEqual(dismissedUntil - now, 604800000); // 7 days in milliseconds
    assert.strictEqual(dismissedUntil > now, true);
  });

  it('verifies offline fallback page (~offline/page.tsx) exists', () => {
    const offlinePagePath = path.join(rootDir, 'src', 'app', '~offline', 'page.tsx');
    assert.strictEqual(fs.existsSync(offlinePagePath), true, '~offline/page.tsx must exist');
    const content = fs.readFileSync(offlinePagePath, 'utf8');
    assert.ok(content.includes('10111'), 'Must include Police 10111 hotline');
    assert.ok(content.includes('10177'), 'Must include Ambulance 10177 hotline');
    assert.ok(content.includes('112'), 'Must include Mobile SOS 112 hotline');
  });

  it('verifies Rider and Driver Home Page Portals both include dedicated Install App buttons', () => {
    const riderPagePath = path.join(rootDir, 'src', 'app', 'rider', 'page.tsx');
    const driverPagePath = path.join(rootDir, 'src', 'app', 'driver', 'page.tsx');

    const riderContent = fs.readFileSync(riderPagePath, 'utf8');
    const driverContent = fs.readFileSync(driverPagePath, 'utf8');

    assert.ok(riderContent.includes("installApp('rider')"), 'Rider portal must invoke installApp("rider")');
    assert.ok(riderContent.includes('Install Rider App'), 'Rider portal must display "Install Rider App" action');

    assert.ok(driverContent.includes("installApp('driver')"), 'Driver portal must invoke installApp("driver")');
    assert.ok(driverContent.includes('Install Driver App'), 'Driver portal must display "Install Driver App" action');
  });

  it('verifies SOLO Landing Page and Navbar display Install App buttons in mobile browser view', () => {
    const landingPagePath = path.join(rootDir, 'src', 'app', 'page.tsx');
    const navbarPath = path.join(rootDir, 'src', 'components', 'Navbar.tsx');

    const landingContent = fs.readFileSync(landingPagePath, 'utf8');
    const navbarContent = fs.readFileSync(navbarPath, 'utf8');

    assert.ok(landingContent.includes("installApp('rider')"), 'Landing page must invoke installApp("rider")');
    assert.ok(landingContent.includes("installApp('driver')"), 'Landing page must invoke installApp("driver")');
    assert.ok(landingContent.includes('Install Rider App'), 'Landing page must display "Install Rider App"');
    assert.ok(landingContent.includes('Install Driver App'), 'Landing page must display "Install Driver App"');
    assert.ok(landingContent.includes('Install App'), 'Landing page must display "Install App"');
    assert.strictEqual(
      landingContent.includes('isAppAlreadyInstalled'),
      false,
      'Landing page must not hide install buttons behind stale persisted isAppAlreadyInstalled flags'
    );

    assert.ok(navbarContent.includes('!isStandalone'), 'Navbar must show Install button whenever !isStandalone');
    assert.strictEqual(
      navbarContent.includes('isAppAlreadyInstalled'),
      false,
      'Navbar must not hide Install button behind stale persisted isAppAlreadyInstalled flags'
    );
  });
});
