import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  verifyManagerPasscode,
  createOwnerAdminSession,
} from '../src/utils/adminAuth.ts';

describe('System Admin & Manager Portal Authorization Suite', () => {
  it('validates authorized manager passcodes and rejects unauthorized keys', () => {
    // Valid passcodes
    assert.strictEqual(verifyManagerPasscode('9021'), true);
    assert.strictEqual(verifyManagerPasscode('SOLO-ADMIN-2026'), true);
    assert.strictEqual(verifyManagerPasscode('SOLO-COMPLIANCE-KEY'), true);
    assert.strictEqual(verifyManagerPasscode('BORAINETECH'), true);

    // Invalid passcodes
    assert.strictEqual(verifyManagerPasscode('1234'), false);
    assert.strictEqual(verifyManagerPasscode('password'), false);
    assert.strictEqual(verifyManagerPasscode(''), false);
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
});
