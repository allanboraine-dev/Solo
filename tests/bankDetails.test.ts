import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SA_BANKS,
  validateSaBankAccount,
  maskAccountNumber,
} from '../src/utils/bankDetails.ts';

describe('South African Banking & Direct Payout Suite', () => {
  it('defines valid 6-digit universal branch codes for all major South African banks', () => {
    assert.strictEqual(SA_BANKS.standard_bank.universalBranchCode, '051001');
    assert.strictEqual(SA_BANKS.fnb.universalBranchCode, '250655');
    assert.strictEqual(SA_BANKS.capitec.universalBranchCode, '470010');
    assert.strictEqual(SA_BANKS.nedbank.universalBranchCode, '198765');
    assert.strictEqual(SA_BANKS.absa.universalBranchCode, '632005');
    assert.strictEqual(SA_BANKS.investec.universalBranchCode, '580105');
    assert.strictEqual(SA_BANKS.tymebank.universalBranchCode, '678910');

    for (const bank of Object.values(SA_BANKS)) {
      assert.strictEqual(/^\d{6}$/.test(bank.universalBranchCode), true, `${bank.name} code must be 6 digits`);
    }
  });

  it('validates compliant South African bank accounts', () => {
    const validStandardBank = validateSaBankAccount({
      bankId: 'standard_bank',
      accountNumber: '1018920194',
      accountType: 'cheque',
    });
    assert.strictEqual(validStandardBank.valid, true);

    const validCapitec = validateSaBankAccount({
      bankId: 'capitec',
      accountNumber: '1589201948',
      accountType: 'savings',
    });
    assert.strictEqual(validCapitec.valid, true);
  });

  it('rejects malformed or non-numeric account numbers', () => {
    const nonNumeric = validateSaBankAccount({
      bankId: 'fnb',
      accountNumber: '12345ABC90',
      accountType: 'cheque',
    });
    assert.strictEqual(nonNumeric.valid, false);
    assert.ok(nonNumeric.error?.includes('digits only'));

    const tooShort = validateSaBankAccount({
      bankId: 'absa',
      accountNumber: '12345',
      accountType: 'cheque',
    });
    assert.strictEqual(tooShort.valid, false);
    assert.ok(tooShort.error?.includes('between 7 and 11 digits'));
  });

  it('rejects unknown bank identifiers', () => {
    const unknown = validateSaBankAccount({
      bankId: 'non_existent_bank',
      accountNumber: '1018920194',
      accountType: 'cheque',
    });
    assert.strictEqual(unknown.valid, false);
    assert.ok(unknown.error?.includes('supported South African retail bank'));
  });

  it('masks account numbers securely for POPIA compliance while preserving the last 4 digits', () => {
    const masked = maskAccountNumber('1018920194');
    assert.strictEqual(masked, '••••••0194');
    assert.strictEqual(masked.endsWith('0194'), true);
  });
});
