import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatPhoneNumber,
  isValidSAPhone,
  generateWhatsAppOtpCode,
  phoneToDeterministicUuid,
  buildWhatsAppVerificationUrl,
  buildWhatsAppTripShareUrl,
} from '../src/utils/phone.ts';

describe('South African Phone Number & WhatsApp Deep-Link Authentication Suite', () => {
  it('formats standard local mobile numbers to E.164 format (+27...) ', () => {
    assert.strictEqual(formatPhoneNumber('0821234567'), '+27821234567');
    assert.strictEqual(formatPhoneNumber('071 234 5678'), '+27712345678');
    assert.strictEqual(formatPhoneNumber('060-987-6543'), '+27609876543');
    assert.strictEqual(formatPhoneNumber('083.555.1234'), '+27835551234');
  });

  it('preserves numbers that already contain +27', () => {
    assert.strictEqual(formatPhoneNumber('+27821234567'), '+27821234567');
    assert.strictEqual(formatPhoneNumber('+27 82 123 4567'), '+27821234567');
  });

  it('adds plus to numbers starting with 27 without plus', () => {
    assert.strictEqual(formatPhoneNumber('27821234567'), '+27821234567');
  });

  it('validates legitimate South African mobile numbers', () => {
    assert.strictEqual(isValidSAPhone('0821234567'), true);
    assert.strictEqual(isValidSAPhone('072 345 6789'), true);
    assert.strictEqual(isValidSAPhone('+27841234567'), true);
    assert.strictEqual(isValidSAPhone('0601234567'), true);
    assert.strictEqual(isValidSAPhone('083 999 8888'), true);
  });

  it('rejects invalid or malformed numbers', () => {
    assert.strictEqual(isValidSAPhone(''), false);
    assert.strictEqual(isValidSAPhone('12345'), false); // Too short
    assert.strictEqual(isValidSAPhone('082123456789'), false); // Too long
    assert.strictEqual(isValidSAPhone('082abc1234'), false); // Letters
    assert.strictEqual(isValidSAPhone('+14155552671'), false); // US number
    assert.strictEqual(isValidSAPhone('0000000000'), false); // Zero lead
  });

  it('generates a 6-digit numeric WhatsApp verification passcode', () => {
    const code = generateWhatsAppOtpCode();
    assert.strictEqual(code.length, 6);
    assert.match(code, /^\d{6}$/);
  });

  it('converts phone numbers into deterministic RFC 4122 UUIDs for Postgres public.trips', () => {
    const uuid = phoneToDeterministicUuid('082 123 4567');
    assert.strictEqual(uuid, '00000000-0000-4000-8000-027821234567');
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('builds a zero-cost WhatsApp Click-to-Verify (wa.me) deep-link URL without Twilio', () => {
    const url = buildWhatsAppVerificationUrl('082 123 4567', 'Thabo Mbeki', '482910');
    assert.ok(url.startsWith('https://wa.me/27821234567?text='));
    const decoded = decodeURIComponent(url);
    assert.ok(decoded.includes('Thabo Mbeki'));
    assert.ok(decoded.includes('+27821234567'));
    assert.ok(decoded.includes('*482910*'));
  });

  it('builds a WhatsApp live trip safety share URL (wa.me)', () => {
    const shareUrl = buildWhatsAppTripShareUrl({
      id: 'trip-987654321',
      pickup_location: 'Camps Bay, Cape Town',
      dropoff_location: 'V&A Waterfront, Cape Town',
      verification_pin: '4892',
      fare_amount: 82,
    });
    assert.ok(shareUrl.startsWith('https://wa.me/?text='));
    const decoded = decodeURIComponent(shareUrl);
    assert.ok(decoded.includes('Camps Bay, Cape Town'));
    assert.ok(decoded.includes('*4892*'));
    assert.ok(decoded.includes('R82'));
  });
});
