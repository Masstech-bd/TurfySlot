import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { resetAdminPassword } from '../database/resetAdminPassword.js';

test('resets only an existing admin password and increments token version', async () => {
  let lookup;
  let update;
  const users = {
    findOne: async (filter) => {
      lookup = filter;
      return { id: 'admin-1', role: 'admin' };
    },
    updateOne: async (filter, change) => {
      update = { filter, change };
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const password = 'NewAdminPass!2026';

  await resetAdminPassword({ users, email: '  ADMIN@example.test ', password });

  assert.deepEqual(lookup, { email: 'admin@example.test', role: 'admin' });
  assert.deepEqual(update.filter, { id: 'admin-1', email: 'admin@example.test', role: 'admin' });
  assert.equal(await bcrypt.compare(password, update.change.$set.password_hash), true);
  assert.notEqual(update.change.$set.password_hash, password);
  assert.equal(update.change.$inc.token_version, 1);
  assert.ok(update.change.$set.updated_at);
  assert.equal(Object.hasOwn(update.change.$set, 'role'), false);
  assert.equal(Object.hasOwn(update.change.$set, 'status'), false);
});

test('does not update a missing admin or an account with another role', async () => {
  let updateCount = 0;
  const users = {
    findOne: async () => null,
    updateOne: async () => { updateCount += 1; return { matchedCount: 1, modifiedCount: 1 }; },
  };

  await assert.rejects(
    resetAdminPassword({ users, email: 'player@example.test', password: 'NewAdminPass!2026' }),
    /No admin account/,
  );
  assert.equal(updateCount, 0);
});

test('rejects invalid emails and weak passwords before database access', async () => {
  let queryCount = 0;
  const users = { findOne: async () => { queryCount += 1; return null; } };

  await assert.rejects(
    resetAdminPassword({ users, email: 'not-an-email', password: 'NewAdminPass!2026' }),
    /valid admin email/,
  );
  await assert.rejects(
    resetAdminPassword({ users, email: 'admin@example.test', password: 'short' }),
    /12–200 characters/,
  );
  assert.equal(queryCount, 0);
});

test('reports a concurrent account change instead of claiming reset success', async () => {
  const users = {
    findOne: async () => ({ id: 'admin-1', role: 'admin' }),
    updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
  };

  await assert.rejects(
    resetAdminPassword({ users, email: 'admin@example.test', password: 'NewAdminPass!2026' }),
    /changed during reset/,
  );
});
