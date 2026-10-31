import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('SOLO See Password & Email Confirmation Suite', () => {
  it('verifies Driver Registration page has see password toggle and emailRedirectTo option', () => {
    const filePath = path.join(process.cwd(), 'src/app/driver/register/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // See password toggle assertions
    assert.ok(content.includes('showPassword'), 'Driver register page must define showPassword state');
    assert.ok(content.includes('setShowPassword'), 'Driver register page must define setShowPassword updater');
    assert.ok(content.includes('Eye'), 'Driver register page must import Eye icon');
    assert.ok(content.includes('EyeOff'), 'Driver register page must import EyeOff icon');
    assert.ok(
      content.includes("type={showPassword ? 'text' : 'password'}"),
      'Driver register password input must toggle between text and password'
    );

    // Email confirmation redirect assertions
    assert.ok(
      content.includes('emailRedirectTo: redirectUrl'),
      'Driver register page must include emailRedirectTo in supabase.auth.signUp options'
    );
    assert.ok(
      content.includes('/auth/callback?next=/driver'),
      'Driver register page must point callback redirect to /auth/callback?next=/driver'
    );
    assert.ok(
      content.includes('registered=pending_confirmation'),
      'Driver register page must route unconfirmed drivers to login with pending_confirmation'
    );
  });

  it('verifies Driver Login page has see password toggle and resend confirmation email capability', () => {
    const filePath = path.join(process.cwd(), 'src/app/driver/login/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // See password toggle assertions
    assert.ok(content.includes('showPassword'), 'Driver login page must define showPassword state');
    assert.ok(content.includes('setShowPassword'), 'Driver login page must define setShowPassword updater');
    assert.ok(content.includes('Eye'), 'Driver login page must import Eye icon');
    assert.ok(content.includes('EyeOff'), 'Driver login page must import EyeOff icon');
    assert.ok(
      content.includes("type={showPassword ? 'text' : 'password'}"),
      'Driver login password input must toggle between text and password'
    );

    // Confirmation handling assertions
    assert.ok(
      content.includes('handleResendConfirmation'),
      'Driver login page must implement handleResendConfirmation'
    );
    assert.ok(
      content.includes('supabase.auth.resend'),
      'Driver login page must invoke supabase.auth.resend for unconfirmed drivers'
    );
    assert.ok(
      content.includes('isPendingConfirmation'),
      'Driver login page must handle pending_confirmation state'
    );
    assert.ok(
      content.includes('Resend confirmation email'),
      'Driver login page must provide a resend confirmation email button'
    );
  });

  it('verifies Admin Login page has see password & PIN toggle capability', () => {
    const filePath = path.join(process.cwd(), 'src/app/admin/login/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('showPassword'), 'Admin login page must define showPassword state');
    assert.ok(content.includes('showPin'), 'Admin login page must define showPin state');
    assert.ok(content.includes('Eye'), 'Admin login page must import Eye icon');
    assert.ok(content.includes('EyeOff'), 'Admin login page must import EyeOff icon');
    assert.ok(
      content.includes('type={showPassword ? "text" : "password"}'),
      'Executive Password input must toggle between text and password'
    );
    assert.ok(
      content.includes('type={showPin ? "text" : "password"}'),
      'Master Security PIN input must toggle between text and password'
    );
  });

  it('verifies Auth Callback route handles confirmation and recovery redirects intelligently', () => {
    const filePath = path.join(process.cwd(), 'src/app/auth/callback/route.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(
      content.includes('/driver/login?confirmed=true'),
      'Auth callback must default non-recovery confirmations to /driver/login?confirmed=true'
    );
    assert.ok(
      content.includes('confirmation_failed'),
      'Auth callback must handle confirmation failures with distinct reason'
    );
  });

  it('verifies Driver Portal has removed bank settlement payouts in favor of 100% direct cash & speedpoint', () => {
    const filePath = path.join(process.cwd(), 'src/app/driver/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.strictEqual(
      content.includes('DriverBankSettlementModal'),
      false,
      'Driver page must not import or render DriverBankSettlementModal'
    );
    assert.strictEqual(
      content.includes('showBankModal'),
      false,
      'Driver page must not maintain showBankModal state'
    );
    assert.ok(
      content.includes('Direct Rider Fares'),
      'Driver page must display Direct Rider Fares card'
    );
    assert.ok(
      content.includes('Speedpoint machine'),
      'Driver page must explain that drivers receive fares directly via Cash or Speedpoint'
    );
  });

  it('verifies landing page removed "Book a Ride Now" in favor of PWA app installation first', () => {
    const filePath = path.join(process.cwd(), 'src/app/page.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.strictEqual(
      content.includes('Book a Ride Now'),
      false,
      'Landing page must not display "Book a Ride Now" button'
    );
    assert.ok(
      content.includes('Install Rider App (PWA)'),
      'Landing page must feature "Install Rider App (PWA)" as primary action'
    );
  });
});
