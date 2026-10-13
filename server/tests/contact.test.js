import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PHONE_PATTERN, normalizeEmail, normalizePhone, parseIdentifier } from '../utils/contact.js';

describe('email and phone helpers', () => {
  it('cleans up phone numbers', () => {
    assert.equal(normalizePhone('+370 600-12345'), '+37060012345');
    assert.equal(normalizePhone('(+370) 600 12345'), '+37060012345');
    assert.equal(normalizePhone('0037060012345'), '+37060012345');
    assert.equal(normalizePhone('  +1 (555) 123-4567 '), '+15551234567');
  });

  it('accepts only international phone numbers', () => {
    assert.equal(PHONE_PATTERN.test('+37060012345'), true);
    assert.equal(PHONE_PATTERN.test('+15551234567'), true);
    assert.equal(PHONE_PATTERN.test('37060012345'), false);
    assert.equal(PHONE_PATTERN.test('+0123456789'), false);
    assert.equal(PHONE_PATTERN.test('+1234'), false);
    assert.equal(PHONE_PATTERN.test('+12345678901234567'), false);
    assert.equal(PHONE_PATTERN.test('+37060012x45'), false);
  });

  it('cleans up emails', () => {
    assert.equal(normalizeEmail('  Alice@Test.COM '), 'alice@test.com');
  });

  it('tells emails from phone numbers', () => {
    assert.deepEqual(parseIdentifier('Alice@Test.com'), { field: 'email', value: 'alice@test.com', channel: 'email' });
    assert.deepEqual(parseIdentifier('+370 600 12345'), { field: 'phone', value: '+37060012345', channel: 'sms' });
  });
});
