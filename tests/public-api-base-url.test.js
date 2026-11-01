import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicApiBaseUrl } from '../server/publicApiBaseUrl.js';

test('normalizes HTTPS API origins', () => {
  assert.equal(normalizePublicApiBaseUrl('https://api.example.com/'), 'https://api.example.com');
});

test('allows localhost HTTP only when explicitly enabled', () => {
  assert.equal(normalizePublicApiBaseUrl('http://localhost:5000', { allowHttpLocalhost: true }), 'http://localhost:5000');
  assert.equal(normalizePublicApiBaseUrl('http://api.example.com', { allowHttpLocalhost: true }), null);
  assert.equal(normalizePublicApiBaseUrl('http://localhost:5000'), null);
});

test('rejects paths, credentials, queries, fragments, and malformed URLs', () => {
  for (const value of [
    'https://api.example.com/api',
    'https://user:pass@api.example.com',
    'https://api.example.com?next=/callback',
    'https://api.example.com#callback',
    'not a URL',
    '',
  ]) {
    assert.equal(normalizePublicApiBaseUrl(value, { allowHttpLocalhost: true }), null, value);
  }
});
