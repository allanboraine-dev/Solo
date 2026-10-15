import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPhoneNumber, isValidSAPhone } from '../src/utils/phone.ts';

describe('South African Phone Number Authentication Suite', () => {
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
});
