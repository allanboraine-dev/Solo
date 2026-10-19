import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  verifyManagerPasscode,
  isOwnerPasscode,
  createOwnerAdminSession,
} from '../src/utils/adminAuth.ts';
import { isOwnerPassword } from '../src/utils/owner.ts';

describe('System Admin & Manager Portal Authorization Suite', () => {
  it('validates authorized manager passcodes and rejects unauthorized keys', () => {
    // Valid passcodes
    assert.strictEqual(verifyManagerPasscode('13579'), true);
    assert.strictEqual(verifyManagerPasscode('9021'), true);
    assert.strictEqual(verifyManagerPasscode('SOLO-ADMIN-2026'), true);
    assert.strictEqual(verifyManagerPasscode('SOLO-COMPLIANCE-KEY'), true);
    assert.strictEqual(verifyManagerPasscode('BORAINETECH'), true);

    // Invalid passcodes
    assert.strictEqual(verifyManagerPasscode('1234'), false);
    assert.strictEqual(verifyManagerPasscode('password'), false);
    assert.strictEqual(verifyManagerPasscode(''), false);
  });

  it('validates platform owner master passcode (13579) and password', () => {
    assert.strictEqual(isOwnerPasscode('13579'), true);
    assert.strictEqual(isOwnerPasscode('  13579  '), true);
    assert.strictEqual(isOwnerPasscode('BORAINETECH'), true);
    assert.strictEqual(isOwnerPasscode('9021'), false);
    assert.strictEqual(isOwnerPasscode('random'), false);

    assert.strictEqual(isOwnerPassword('13579'), true);
    assert.strictEqual(isOwnerPassword('  13579  '), true);
    assert.strictEqual(isOwnerPassword('wrongpassword'), false);
    assert.strictEqual(isOwnerPassword(null), false);
    assert.strictEqual(isOwnerPassword(''), false);
  });


  it('creates super_admin session with platform owner privileges for Allan Boraine', () => {
    const session = createOwnerAdminSession('allanboraine@gmail.com');
    assert.strictEqual(session.role, 'super_admin');
    assert.strictEqual(session.isOwner, true);
    assert.strictEqual(session.name.includes('Allan Boraine'), true);
    assert.strictEqual(session.email, 'allanboraine@gmail.com');
    assert.strictEqual(typeof session.loginTime, 'string');
  });

  it('creates generic compliance manager session for non-owner email', () => {
    const session = createOwnerAdminSession('manager@soloride.co.za');
    assert.strictEqual(session.role, 'super_admin');
    assert.strictEqual(session.isOwner, false);
    assert.strictEqual(session.name, 'Compliance Manager');
  });

  it('validates validateAdminRequest authorization engine', async () => {
    const { validateAdminRequest } = await import('../src/utils/adminAuth.ts');

    // 1. Unauthenticated request: No headers, no cookies
    const emptyReq = { headers: new Map() } as any;
    assert.strictEqual(validateAdminRequest(emptyReq).authorized, false);

    // 2. Direct passcode header (Owner 13579)
    const ownerHeaderReq = {
      headers: new Map([['x-admin-passcode', '13579']]),
    } as any;
    const auth1 = validateAdminRequest(ownerHeaderReq);
    assert.strictEqual(auth1.authorized, true);
    assert.strictEqual(auth1.session?.role, 'super_admin');
    assert.strictEqual(auth1.session?.isOwner, true);

    // 3. Manager passcode header (Operations 9021)
    const managerHeaderReq = {
      headers: new Map([['x-admin-passcode', '9021']]),
    } as any;
    const auth2 = validateAdminRequest(managerHeaderReq);
    assert.strictEqual(auth2.authorized, true);
    assert.strictEqual(auth2.session?.role, 'compliance_manager');

    // 4. Invalid passcode header
    const badPasscodeReq = {
      headers: new Map([['x-admin-passcode', 'invalid_pin']]),
    } as any;
    assert.strictEqual(validateAdminRequest(badPasscodeReq).authorized, false);

    // 5. Valid session cookie
    const validSession = {
      email: 'operations@soloride.co.za',
      name: 'Operations Manager',
      role: 'compliance_manager',
      loginTime: new Date().toISOString(),
    };
    const validCookieReq = {
      headers: new Map([
        ['cookie', `solo_admin_session=${encodeURIComponent(JSON.stringify(validSession))}`],
      ]),
    } as any;
    const auth3 = validateAdminRequest(validCookieReq);
    assert.strictEqual(auth3.authorized, true);

    // 6. Impersonation protection: Non-owner claiming isOwner in cookie
    const spoofedSession = {
      email: 'hacker@example.com',
      name: 'Allan Impersonator',
      role: 'super_admin',
      isOwner: true,
      loginTime: new Date().toISOString(),
    };
    const spoofedCookieReq = {
      headers: new Map([
        ['cookie', `solo_admin_session=${encodeURIComponent(JSON.stringify(spoofedSession))}`],
      ]),
    } as any;
    assert.strictEqual(validateAdminRequest(spoofedCookieReq).authorized, false);
  });

  it('verifies admin login page has no public bypass buttons or exposed PINs', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const loginSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'admin', 'login', 'page.tsx'),
      'utf8'
    );

    // No one-click founder bypass button
    assert.strictEqual(
      loginSource.includes('handleQuickFounderLogin'),
      false,
      'Login page must not contain handleQuickFounderLogin'
    );
    assert.strictEqual(
      loginSource.includes('Instant Clearance as Platform Founder'),
      false,
      'Login page must not render Instant Clearance button'
    );

    // No plaintext PIN hints printed on the screen
    assert.strictEqual(
      loginSource.includes('Owner Master PIN: 13579'),
      false,
      'Login page must not display master PIN on the public interface'
    );
    assert.strictEqual(
      loginSource.includes('Operations PIN: 9021'),
      false,
      'Login page must not display operations PIN on the public interface'
    );

    // Brute force lockout protection
    assert.strictEqual(
      loginSource.includes('isLockedOut'),
      true,
      'Login page must implement lockout state after failed attempts'
    );
  });

  it('verifies middleware.ts locks down /admin and /api/admin from unauthorized public callers', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const middlewareSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'middleware.ts'),
      'utf8'
    );

    assert.strictEqual(
      middlewareSource.includes("pathname.startsWith('/api/admin/')"),
      true,
      'Middleware must inspect and guard /api/admin/ routes'
    );
    assert.strictEqual(
      middlewareSource.includes("pathname.startsWith('/admin')"),
      true,
      'Middleware must inspect and guard /admin pages'
    );
    assert.strictEqual(
      middlewareSource.includes('validateAdminRequest'),
      true,
      'Middleware must invoke validateAdminRequest'
    );
  });
});

