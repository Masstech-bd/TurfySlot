import test from 'node:test';
import assert from 'node:assert/strict';
import { getMongoConnectionString } from '../database/mongoConnection.js';

test('prefers MONGODB_CONN when both connection variables are set', () => {
  assert.equal(getMongoConnectionString({
    MONGODB_CONN: 'mongodb+srv://new.example',
    MONGODB_URI: 'mongodb+srv://legacy.example',
  }), 'mongodb+srv://new.example');
});

test('supports the legacy MONGODB_URI variable during transition', () => {
  assert.equal(getMongoConnectionString({
    MONGODB_URI: 'mongodb+srv://legacy.example',
  }), 'mongodb+srv://legacy.example');
});

test('returns undefined when neither connection variable is configured', () => {
  assert.equal(getMongoConnectionString({}), undefined);
});
