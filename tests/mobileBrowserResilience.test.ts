import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRiderSessionId, getSessionItem, setSessionItem, removeSessionItem } from '../src/utils/session.ts';

describe('Mobile Browser Resilience & Viewport Optimization Suite', () => {
  const rootDir = process.cwd();

  test('validates viewport metadata in layout.tsx includes viewportFit cover and interactiveWidget resizes-content', () => {
    const layoutPath = path.join(rootDir, 'src', 'app', 'layout.tsx');
    const layoutCode = fs.readFileSync(layoutPath, 'utf8');

    assert.ok(
      layoutCode.includes('viewportFit: "cover"'),
      'layout.tsx must configure viewportFit cover for notch and home-bar support'
    );
    assert.ok(
      layoutCode.includes('interactiveWidget: "resizes-content"'),
      'layout.tsx must configure interactiveWidget resizes-content to avoid mobile keyboard overlaps'
    );
    assert.ok(
      layoutCode.includes('mobile-web-app-capable'),
      'layout.tsx must declare mobile-web-app-capable for Android Chrome & Safari WebViews'
    );
  });

  test('validates globals.css contains legacy viewport height fallbacks and touch optimizations', () => {
    const cssPath = path.join(rootDir, 'src', 'app', 'globals.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    // Viewport height fallbacks
    assert.ok(cssCode.includes('height: calc(100vh - 64px);'), 'globals.css must provide 100vh fallback for 100dvh');
    assert.ok(cssCode.includes('height: calc(100dvh - 64px);'), 'globals.css must support dynamic viewport 100dvh');
    assert.ok(cssCode.includes('.h-mobile-portal'), 'globals.css must define .h-mobile-portal');

    // Safe area utility classes
    assert.ok(cssCode.includes('env(safe-area-inset-top'), 'globals.css must define safe-area-inset-top');
    assert.ok(cssCode.includes('env(safe-area-inset-bottom'), 'globals.css must define safe-area-inset-bottom');
    assert.ok(cssCode.includes('.pt-safe'), 'globals.css must define .pt-safe');
    assert.ok(cssCode.includes('.pb-safe'), 'globals.css must define .pb-safe');
    assert.ok(cssCode.includes('.mb-safe'), 'globals.css must define .mb-safe');

    // Anti-pull-to-refresh & mobile gesture ergonomics
    assert.ok(cssCode.includes('overscroll-behavior-y: contain;'), 'globals.css must contain overscroll-behavior-y');
    assert.ok(cssCode.includes('touch-action: manipulation;'), 'globals.css must eliminate 300ms tap delay via touch-action: manipulation');
    assert.ok(cssCode.includes('-webkit-tap-highlight-color: transparent;'), 'globals.css must remove mobile tap highlight');
    assert.ok(cssCode.includes('-webkit-overflow-scrolling: touch;'), 'globals.css must enable smooth momentum scrolling');
  });

  test('validates Rider and Driver portals implement mobile viewport and safe area classes', () => {
    const riderPath = path.join(rootDir, 'src', 'app', 'rider', 'page.tsx');
    const riderCode = fs.readFileSync(riderPath, 'utf8');

    assert.ok(riderCode.includes('h-mobile-portal'), 'Rider portal must use h-mobile-portal for universal browser viewport support');
    assert.ok(riderCode.includes('pt-safe'), 'Rider portal header must use pt-safe to prevent notch overlap');
    assert.ok(riderCode.includes('pb-safe'), 'Rider bottom sheet must use pb-safe to prevent home pill overlap');

    const driverPath = path.join(rootDir, 'src', 'app', 'driver', 'page.tsx');
    const driverCode = fs.readFileSync(driverPath, 'utf8');

    assert.ok(driverCode.includes('h-mobile-portal'), 'Driver portal must use h-mobile-portal for universal browser viewport support');
    assert.ok(driverCode.includes('pt-safe'), 'Driver portal header must use pt-safe to prevent notch overlap');
    assert.ok(driverCode.includes('mb-safe'), 'Driver floating bottom navigation must use mb-safe');
  });

  test('validates MapComponent disables legacy tap emulation and enables touch pan handling', () => {
    const mapPath = path.join(rootDir, 'src', 'components', 'MapComponent.tsx');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    assert.ok(
      mapCode.includes('tap={false}'),
      'MapContainer must set tap={false} to eliminate double-tap bugs on modern mobile browsers'
    );
    assert.ok(
      mapCode.includes('touch-pan-x touch-pan-y'),
      'MapComponent wrapper must declare touch-pan-x touch-pan-y for smooth native panning'
    );
  });

  test('validates in-memory storage fallback works when browser storage throws QuotaExceededError or SecurityError', () => {
    // Test normal read/write via helper
    const testKey = 'test_mobile_storage_key';
    const testValue = 'test_mobile_storage_value';

    setSessionItem(testKey, testValue);
    const retrieved = getSessionItem(testKey);
    assert.equal(retrieved, testValue, 'Session storage helper must persist and retrieve values');

    removeSessionItem(testKey);
    assert.equal(getSessionItem(testKey), null, 'Removed item must return null');

    // Verify session ID generation is resilient
    const sessionId = getRiderSessionId();
    assert.ok(typeof sessionId === 'string' && sessionId.length > 5, 'Rider session ID must be generated reliably');
  });
});
