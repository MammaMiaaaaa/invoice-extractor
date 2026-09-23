import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isValidSignature } from './whatsapp.js';

test('accepts only bodies signed with the app secret', () => {
  const body = Buffer.from('{"entry":[]}');
  const sign = (secret) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  assert.equal(isValidSignature(body, sign('s3cret'), 's3cret'), true);
  assert.equal(isValidSignature(body, sign('wrong'), 's3cret'), false);
  assert.equal(isValidSignature(body, undefined, 's3cret'), false);
  assert.equal(isValidSignature(undefined, sign('s3cret'), 's3cret'), false);
});
