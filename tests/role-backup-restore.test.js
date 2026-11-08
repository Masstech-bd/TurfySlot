import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildRestorePlan, getRestoreCounts, validateBackup, validateDestinationSnapshot } from '../database/roleBackupRestore.js';
import { runRestore, writeRestorePlan } from '../database/importRoleJsonBackups.js';

const makeBackup = (category, records) => ({
  formatVersion: 1,
  category,
  generatedAt: '2026-11-08T10:00:00.000Z',
  databaseProvider: 'mongodb',
  records: { users: [], ...records },
});

const makeBackups = (overrides = {}) => ({
  players: makeBackup('players', {
    users: [{ _id: 'mongo-player', id: 'player-1', role: 'player', email: 'player@example.test' }],
    bookings: [{
      _id: 'mongo-booking-player',
      id: 'booking-1',
      player_id: 'player-1',
      turf_id: 'turf-1',
      status: 'confirmed',
    }],
    booking_slots: [{ id: 'link-1', booking_id: 'booking-1', slot_id: 'slot-1' }],
    slots_for_bookings: [{ id: 'slot-1', turf_id: 'turf-1', date: '2026-11-09', start_time: '10:00', end_time: '11:00' }],
    wallet_transactions_for_bookings: [{
      id: 'wallet-transaction-1',
      owner_id: 'owner-1',
      booking_id: 'booking-1',
      amount: 10,
    }],
    admin_audit_logs: [],
    ...overrides.players,
  }),
  owners: makeBackup('owners', {
    users: [{ id: 'owner-1', role: 'turf_owner', email: 'owner@example.test' }],
    owner_profiles: [{ id: 'profile-1', user_id: 'owner-1' }],
    turfs: [{ id: 'turf-1', owner_id: 'owner-1' }],
    bookings: [{
      id: 'booking-1',
      player_id: 'player-1',
      turf_id: 'turf-1',
      status: 'confirmed',
    }],
    slots: [{ id: 'slot-1', turf_id: 'turf-1', date: '2026-11-09', start_time: '10:00', end_time: '11:00' }],
    wallet_transactions: [{
      id: 'wallet-transaction-1',
      owner_id: 'owner-1',
      booking_id: 'booking-1',
      amount: 10,
    }],
    ...overrides.owners,
  }),
  admins: makeBackup('admins', {
    users: [{ id: 'admin-1', role: 'admin', email: 'admin@example.test' }],
    admin_audit_logs: [],
    ...overrides.admins,
  }),
});

test('merges identical records, removes Mongo _id values, and leaves non-admin passwords unset', () => {
  const plan = buildRestorePlan(makeBackups());

  assert.equal(plan.get('bookings').length, 1);
  assert.equal(plan.get('slots').length, 1);
  assert.equal(plan.get('wallet_transactions').length, 1);
  assert.equal(plan.get('users').length, 3);
  assert.equal(plan.get('users').find((user) => user.role === 'player').password_hash, null);
  assert.equal(plan.get('users').find((user) => user.role === 'turf_owner').password_hash, null);
  assert.equal(plan.get('users').find((user) => user.role === 'admin').password_hash, null);
  assert.ok(plan.get('users').every((user) => user.token_version > 0));
  assert.equal(Object.hasOwn(plan.get('users').find((user) => user.id === 'player-1'), '_id'), false);
  assert.deepEqual(getRestoreCounts(plan), {
    users: 3,
    turf_owner_profiles: 1,
    turfs: 1,
    slots: 1,
    bookings: 1,
    booking_slots: 1,
    wallet_transactions: 1,
  });
});

test('rejects conflicting duplicate records', () => {
  const backups = makeBackups({
    owners: {
      bookings: [{ id: 'booking-1', player_id: 'player-1', turf_id: 'turf-1', status: 'cancelled' }],
    },
  });
  assert.throws(() => buildRestorePlan(backups), /conflicting records/);
});

test('rejects sensitive fields in an export', () => {
  const backup = makeBackup('admins', {
    users: [{ id: 'admin-1', role: 'admin', email: 'admin@example.test', password_hash: 'not-allowed' }],
    admin_audit_logs: [],
  });
  assert.throws(() => validateBackup(backup, 'admins'), /prohibited sensitive field/);
});

test('rejects records with missing required relationships', () => {
  const backups = makeBackups({
    owners: { turfs: [] },
  });
  assert.throws(() => buildRestorePlan(backups), /missing data in turfs/);
});

test('rejects records that would conflict with MongoDB unique indexes', () => {
  const backups = makeBackups({
    players: {
      bookings: [
        { id: 'booking-1', player_id: 'player-1', turf_id: 'turf-1', status: 'confirmed' },
        { id: 'booking-2', player_id: 'player-1', turf_id: 'turf-1', status: 'confirmed' },
      ],
      booking_slots: [],
      slots_for_bookings: [],
    },
    owners: {
      bookings: [
        { id: 'booking-1', player_id: 'player-1', turf_id: 'turf-1', status: 'confirmed' },
        { id: 'booking-2', player_id: 'player-1', turf_id: 'turf-1', status: 'confirmed' },
      ],
      slots: [
        { id: 'slot-1', turf_id: 'turf-1', date: '2026-11-09', start_time: '10:00' },
        { id: 'slot-2', turf_id: 'turf-1', date: '2026-11-09', start_time: '10:00' },
      ],
    },
  });
  assert.throws(() => buildRestorePlan(backups), /unique database constraint in slots/);
});

test('allows an empty destination and the unchanged application bootstrap records', () => {
  validateDestinationSnapshot({ collectionCounts: {} });

  const policy = { id: 'standard', name: 'Standard', is_default: true };
  validateDestinationSnapshot({
    collectionCounts: {
      schema_migrations: 6,
      feature_flags: 8,
      cancellation_policies: 1,
      cancellation_policy_tiers: 3,
    },
    featureFlags: [
      'addons_enabled', 'squad_enabled', 'tournament_enabled', 'featured_turf_enabled',
      'featured_addon_enabled', 'whatsapp_enabled', 'trending_enabled', 'near_you_enabled',
    ].map((key) => ({ key, value: false })),
    policies: [policy],
    tiers: [
      { policy_id: policy.id, hours_before_start_min: 0, hours_before_start_max: 6, refund_percentage: 0, sort_order: 0 },
      { policy_id: policy.id, hours_before_start_min: 6, hours_before_start_max: 24, refund_percentage: 50, sort_order: 1 },
      { policy_id: policy.id, hours_before_start_min: 24, hours_before_start_max: null, refund_percentage: 100, sort_order: 2 },
    ],
  });
});

test('refuses existing destination application data and modified bootstrap values', () => {
  assert.throws(
    () => validateDestinationSnapshot({ collectionCounts: { users: 1 } }),
    /destination is not empty/,
  );
  assert.throws(
    () => validateDestinationSnapshot({
      collectionCounts: { feature_flags: 1 },
      featureFlags: [{ key: 'addons_enabled', value: true }],
    }),
    /non-default feature-flag data/,
  );
});

test('writes the restore plan through one transaction and verifies its counts', async () => {
  const documents = new Map();
  let transactionCount = 0;
  const session = {
    async withTransaction(callback) {
      transactionCount += 1;
      await callback();
    },
    async endSession() {},
  };
  const client = { startSession: () => session };
  const database = {
    listCollections: () => ({ toArray: async () => [] }),
    collection(name) {
      return {
        insertMany: async (records, options) => {
          assert.equal(options.session, session);
          documents.set(name, [...(documents.get(name) || []), ...records]);
        },
        countDocuments: async (filter, options) => {
          assert.equal(options.session, session);
          return (documents.get(name) || []).filter((record) => filter.id.$in.includes(record.id)).length;
        },
      };
    },
  };

  await writeRestorePlan(client, database, new Map([
    ['users', [{ id: 'admin-1' }]],
    ['turfs', [{ id: 'turf-1' }]],
  ]));
  assert.equal(transactionCount, 1);
  assert.deepEqual(documents.get('users'), [{ id: 'admin-1' }]);
  assert.deepEqual(documents.get('turfs'), [{ id: 'turf-1' }]);
});

test('aborts the transaction when a collection insert fails', async () => {
  const documents = new Map();
  const session = {
    async withTransaction(callback) {
      const before = new Map(documents);
      try {
        await callback();
      } catch (error) {
        documents.clear();
        for (const [name, rows] of before) documents.set(name, rows);
        throw error;
      }
    },
    async endSession() {},
  };
  const client = { startSession: () => session };
  const database = {
    listCollections: () => ({ toArray: async () => [] }),
    collection(name) {
      return {
        insertMany: async (records) => {
          if (name === 'turfs') throw new Error('injected failure');
          documents.set(name, [...(documents.get(name) || []), ...records]);
        },
        countDocuments: async () => documents.get(name)?.length || 0,
      };
    },
  };

  await assert.rejects(
    writeRestorePlan(client, database, new Map([
      ['users', [{ id: 'admin-1' }]],
      ['turfs', [{ id: 'turf-1' }]],
    ])),
    /injected failure/,
  );
  assert.equal(documents.size, 0);
});

test('dry run validates the destination and never starts a transaction or writes records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'turfy-role-restore-'));
  const originalDatabase = process.env.MONGODB_DATABASE;
  const originalConnection = process.env.MONGODB_CONN;
  const originalUri = process.env.MONGODB_URI;
  try {
    const backups = {
      players: makeBackup('players', { users: [] }),
      owners: makeBackup('owners', { users: [] }),
      admins: makeBackup('admins', {
        users: [{ id: 'admin-1', role: 'admin', email: 'admin@example.test' }],
        admin_audit_logs: [],
      }),
    };
    const backupPaths = {};
    for (const category of ['players', 'owners', 'admins']) {
      backupPaths[category] = path.join(directory, `${category}.json`);
      await writeFile(backupPaths[category], JSON.stringify(backups[category]));
    }

    process.env.MONGODB_DATABASE = 'restore_test_db';
    process.env.MONGODB_CONN = 'mongodb://test.invalid';
    delete process.env.MONGODB_URI;
    let writes = 0;
    let transactions = 0;
    const database = {
      listCollections: () => ({ toArray: async () => [] }),
      collection: () => ({
        insertMany: async () => { writes += 1; },
      }),
    };
    const client = {
      connect: async () => {},
      db: (name) => {
        assert.equal(name, 'restore_test_db');
        return database;
      },
      close: async () => {},
      startSession: () => { transactions += 1; throw new Error('dry run must not start a transaction'); },
    };
    let output = '';

    await runRestore({
      mode: 'dry-run',
      expectedDatabase: 'restore_test_db',
      backupPaths,
    }, {
      createClient: () => client,
      writeOutput: (text) => { output += text; },
    });

    assert.match(output, /Dry run complete/);
    assert.equal(writes, 0);
    assert.equal(transactions, 0);
  } finally {
    if (originalDatabase === undefined) delete process.env.MONGODB_DATABASE;
    else process.env.MONGODB_DATABASE = originalDatabase;
    if (originalConnection === undefined) delete process.env.MONGODB_CONN;
    else process.env.MONGODB_CONN = originalConnection;
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
    await rm(directory, { recursive: true, force: true });
  }
});
