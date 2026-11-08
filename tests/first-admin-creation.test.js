import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createFirstAdmin } from '../database/createFirstAdmin.js';

test('creates an active admin with a bcrypt password hash and no extra user fields', async () => {
  const inserted = [];
  const users = {
    countDocuments: async (filter) => {
      assert.deepEqual(filter, { role: 'admin' });
      return 0;
    },
    findOne: async (filter) => {
      assert.deepEqual(filter, { email: { $regex: '^admin@example\\.test$', $options: 'i' } });
      return null;
    },
    insertOne: async (record) => { inserted.push(record); },
  };
  const password = 'FirstAdminPass!2026';

  const id = await createFirstAdmin({
    users,
    name: ' First Admin ',
    email: ' ADMIN@example.test ',
    password,
  });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].id, id);
  assert.equal(inserted[0].name, 'First Admin');
  assert.equal(inserted[0].email, 'admin@example.test');
  assert.equal(inserted[0].role, 'admin');
  assert.equal(inserted[0].status, 'active');
  assert.equal(inserted[0].token_version, 0);
  assert.equal(await bcrypt.compare(password, inserted[0].password_hash), true);
  assert.notEqual(inserted[0].password_hash, password);
});

test('refuses to create a second admin', async () => {
  let inserted = false;
  const users = {
    countDocuments: async () => 1,
    findOne: async () => null,
    insertOne: async () => { inserted = true; },
  };

  await assert.rejects(
    createFirstAdmin({ users, name: 'Admin', email: 'new@example.test', password: 'FirstAdminPass!2026' }),
    /admin account already exists/,
  );
  assert.equal(inserted, false);
});

test('refuses an email already used by another role', async () => {
  let inserted = false;
  const users = {
    countDocuments: async () => 0,
    findOne: async () => ({ id: 'player-1' }),
    insertOne: async () => { inserted = true; },
  };

  await assert.rejects(
    createFirstAdmin({ users, name: 'Admin', email: 'taken@example.test', password: 'FirstAdminPass!2026' }),
    /already uses that email/,
  );
  assert.equal(inserted, false);
});

test('validates name, email, and password before inserting', async () => {
  let inserted = false;
  const users = {
    countDocuments: async () => 0,
    findOne: async () => null,
    insertOne: async () => { inserted = true; },
  };

  await assert.rejects(
    createFirstAdmin({ users, name: '', email: 'admin@example.test', password: 'FirstAdminPass!2026' }),
    /Name must be/,
  );
  await assert.rejects(
    createFirstAdmin({ users, name: 'Admin', email: 'invalid', password: 'FirstAdminPass!2026' }),
    /valid email/,
  );
  await assert.rejects(
    createFirstAdmin({ users, name: 'Admin', email: 'admin@example.test', password: 'short' }),
    /Password must be/,
  );
  assert.equal(inserted, false);
});
