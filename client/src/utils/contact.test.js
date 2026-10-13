import { describe, expect, it } from 'vitest';
import { isPhoneNumber, maskIdentifier, normalizePhone } from './contact';

describe('normalizePhone', () => {
  it('removes spaces and punctuation, and turns 00 into +', () => {
    expect(normalizePhone('+370 600-12345')).toBe('+37060012345');
    expect(normalizePhone('(+370) 600 12345')).toBe('+37060012345');
    expect(normalizePhone('0037060012345')).toBe('+37060012345');
  });
});

describe('isPhoneNumber', () => {
  it('accepts international numbers only', () => {
    expect(isPhoneNumber('+37060012345')).toBe(true);
    expect(isPhoneNumber('+1 555 123 4567')).toBe(true);
    expect(isPhoneNumber('060012345')).toBe(false);
    expect(isPhoneNumber('alice@test.com')).toBe(false);
  });
});

describe('maskIdentifier', () => {
  it('hides most of an email', () => {
    expect(maskIdentifier('alice@test.com')).toBe('al***@test.com');
    expect(maskIdentifier('al@test.com')).toBe('al*@test.com');
  });

  it('hides most of a phone number', () => {
    expect(maskIdentifier('+37060012345')).toBe('+370******45');
  });
});
