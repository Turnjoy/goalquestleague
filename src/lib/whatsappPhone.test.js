import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsAppNumber, whatsappChatUrl } from './whatsappPhone.js';

test('normalizes international numbers to digits for WhatsApp links', () => {
  assert.equal(normalizeWhatsAppNumber('+234 801-234-5678'), '2348012345678');
  assert.equal(normalizeWhatsAppNumber('+1 (202) 555-0123'), '12025550123');
  assert.equal(normalizeWhatsAppNumber('0044 20 7946 0958'), '442079460958');
  assert.equal(whatsappChatUrl('+1 (202) 555-0123'), 'https://wa.me/12025550123');
});

test('rejects national-only numbers, invalid characters and out-of-range lengths', () => {
  assert.equal(normalizeWhatsAppNumber('08012345678'), null);
  assert.equal(normalizeWhatsAppNumber('1234567'), null);
  assert.equal(normalizeWhatsAppNumber('1234567890123456'), null);
  assert.equal(normalizeWhatsAppNumber('call me 2348012345678'), null);
  assert.equal(normalizeWhatsAppNumber('234+8012345678'), null);
  assert.equal(whatsappChatUrl(''), null);
});
