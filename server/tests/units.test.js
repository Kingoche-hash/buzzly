import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasValidSignature } from '../utils/fileSignature.js';
import { createSocketLimiter } from '../utils/socketRateLimit.js';
import { signToken, verifyToken } from '../utils/token.js';

const file = (buffer, mimetype, originalname) => ({ buffer, mimetype, originalname });

describe('file signatures (what is REALLY inside a file)', () => {
  it('accepts a real PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.equal(hasValidSignature(file(png, 'image/png', 'a.png')), true);
  });

  it('accepts a real JPEG', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    assert.equal(hasValidSignature(file(jpeg, 'image/jpeg', 'a.jpg')), true);
  });

  it('accepts a real PDF', () => {
    const pdf = Buffer.from('%PDF-1.7 pretend document');
    assert.equal(hasValidSignature(file(pdf, 'application/pdf', 'a.pdf')), true);
  });

  it('accepts a Word document (a zip inside)', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    assert.equal(hasValidSignature(file(zip, type, 'a.docx')), true);
  });

  it('refuses text pretending to be a PNG', () => {
    assert.equal(hasValidSignature(file(Buffer.from('hello world'), 'image/png', 'fake.png')), false);
  });

  it('refuses a program pretending to be a text file', () => {
    const binary = Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x01]);
    assert.equal(hasValidSignature(file(binary, 'text/plain', 'a.txt')), false);
  });

  it('refuses an empty file', () => {
    assert.equal(hasValidSignature(file(Buffer.alloc(0), 'image/png', 'a.png')), false);
  });

  it('treats a .csv as text even when the computer calls it an Excel file', () => {
    const csv = Buffer.from('name,age\nalice,30\n');
    assert.equal(hasValidSignature(file(csv, 'application/vnd.ms-excel', 'data.csv')), true);
  });
});

describe('socket rate limiter', () => {
  it('allows a few actions, then says no', () => {
    const allowed = createSocketLimiter({ limit: 3, windowMs: 10000 });

    assert.equal(allowed(), true);
    assert.equal(allowed(), true);
    assert.equal(allowed(), true);
    assert.equal(allowed(), false);
  });
});

describe('login tokens', () => {
  it('can be checked after they are made', () => {
    assert.equal(verifyToken(signToken('user-123')).sub, 'user-123');
  });

  it('are refused when tampered with', () => {
    assert.throws(() => verifyToken(`${signToken('user-123')}x`));
  });
});
