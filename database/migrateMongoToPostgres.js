import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const args = new Set(process.argv.slice(2));
if (!args.has('--confirm')) {
  throw new Error('This copies MongoDB data into PostgreSQL. Re-run with --confirm after verifying backups.');
}
if ((process.env.DB_PROVIDER || 'postgres').trim().toLowerCase() !== 'postgres') {
  throw new Error('Set DB_PROVIDER=postgres in .env before running this migration.');
}
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for the source database.');
if (!process.env.PGPASSWORD && !process.env.DATABASE_URL) throw new Error('PostgreSQL credentials are required.');

const parseEncryptionKey = (name) => {
  const raw = process.env[name] || '';
  if (/^[a-f\d]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  return decoded.length === 32 ? decoded : null;
};

const encryptionKeys = {
  payout_details: parseEncryptionKey('PAYOUT_ENCRYPTION_KEY'),
  smtp_configs: parseEncryptionKey('SMTP_CONFIG_ENCRYPTION_KEY'),
  sslcommerz_config: parseEncryptionKey('SSLCOMMERZ_CONFIG_ENCRYPTION_KEY'),
  shurjopay_config: parseEncryptionKey('SHURJOPAY_CONFIG_ENCRYPTION_KEY'),
  uddoktapay_config: parseEncryptionKey('UDDOKTAPAY_CONFIG_ENCRYPTION_KEY'),
  push_subscriptions: parseEncryptionKey('PUSH_SUBSCRIPTION_ENCRYPTION_KEY'),
};

const verifyEncryptedEnvelope = (envelope, key, label) => {
  if (envelope?.__encrypted !== 'aes-256-gcm:v1') return;
  if (!key) throw new Error(`Missing encryption key needed to preserve ${label}.`);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    decipher.update(Buffer.from(envelope.ciphertext, 'base64'));
    decipher.final();
  } catch {
    throw new Error(`The configured encryption key cannot decrypt existing ${label}; migration stopped.`);
  }
};

const verifyEncryptedValues = (value, key, label) => {
  if (Array.isArray(value)) {
    for (const item of value) verifyEncryptedValues(item, key, label);
  } else if (value && typeof value === 'object') {
    verifyEncryptedEnvelope(value, key, label);
    for (const child of Object.values(value)) verifyEncryptedValues(child, key, label);
  }
};

const normalizeBson = (value) => {
  if (Array.isArray(value)) return value.map(normalizeBson);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    if (value?._bsontype === 'Decimal128') return value.toString();
    return value;
  }
  if (value._bsontype === 'Decimal128') return value.toString();
  if (value._bsontype === 'ObjectId') return value.toString();
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeBson(child)]));
};

const dependencyOrder = [
  'users',
  'turf_owner_profiles',
  'turfs',
  'turf_photos',
  'turf_pricing_rules',
  'staff_assignments',
  'slots',
  'bookings',
  'booking_slots',
  'manual_bookings',
  'turf_addons',
  'booking_addons',
  'turf_addon_inventory_log',
  'featured_listings',
  'payments',
  'refunds',
  'wallets',
  'withdrawals',
  'wallet_transactions',
  'reviews',
  'notifications',
  'favorites',
  'push_subscriptions',
  'platform_settings',
  'feature_flags',
  'cancellation_policies',
  'cancellation_policy_tiers',
  'turf_cancellation_policies',
  'owner_cancellation_policies',
  'cancellation_policy_audit_logs',
  'disputes',
  'turf_removal_requests',
  'owner_subscription_payments',
  'open_matches',
  'match_participants',
  'tournaments',
  'tournament_teams',
  'tournament_matches',
  'platform_credits',
  'platform_credit_usages',
  'featured_listing_cancellations',
  'audit_logs',
];

const pgPool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    });
const mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const insertRows = async (client, table, rows, columnsByTable) => {
  if (!rows.length) return;
  const columns = columnsByTable.get(table);
  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => columns.has(key) && row[key] !== undefined);
    const unknown = Object.keys(row).filter((key) => !columns.has(key) && row[key] !== undefined);
    if (unknown.length) throw new Error(`Source fields have no PostgreSQL destination in ${table}: ${unknown.join(', ')}.`);
    if (!keys.length) continue;
    const values = keys.map((key) => {
      const value = normalizeBson(row[key]);
      return columns.get(key) === 'jsonb' && value !== null ? JSON.stringify(value) : value;
    });
    const placeholders = keys.map((key, index) => `$${index + 1}${columns.get(key) === 'jsonb' ? '::jsonb' : ''}`);
    await client.query(
      `INSERT INTO ${quoteIdentifier(table)} (${keys.map(quoteIdentifier).join(',')}) VALUES (${placeholders.join(',')})`,
      values,
    );
  }
};

const run = async () => {
  await Promise.all([mongoClient.connect(), pgPool.query('SELECT 1')]);
  const mongoDb = mongoClient.db(process.env.MONGODB_DATABASE || 'turfyslot');
  const databaseName = (await pgPool.query('SELECT current_database() AS name')).rows[0].name;
  const tableRows = await pgPool.query(
    "SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  );
  const columnsByTable = new Map();
  for (const row of tableRows.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
    columnsByTable.get(row.table_name).set(row.column_name, row.udt_name);
  }

  const sourceNames = (await mongoDb.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name)
    .filter((name) => name !== 'schema_migrations');
  const unsupported = sourceNames.filter((name) => !columnsByTable.has(name) && name !== 'schema_migrations');
  if (unsupported.length) throw new Error(`MongoDB collections have no PostgreSQL tables: ${unsupported.join(', ')}.`);

  const data = new Map();
  const sourceSession = mongoClient.startSession();
  try {
    await sourceSession.withTransaction(async () => {
      for (const name of sourceNames) {
        const docs = await mongoDb.collection(name).find({}, { session: sourceSession }).toArray();
        data.set(name, docs.map((doc) => {
          const copy = { ...doc };
          delete copy._id;
          return copy;
        }));
      }
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  } finally {
    await sourceSession.endSession();
  }

  for (const profile of data.get('turf_owner_profiles') || []) {
    verifyEncryptedValues(profile.payout_details, encryptionKeys.payout_details, 'owner payout details');
  }
  for (const subscription of data.get('push_subscriptions') || []) {
    verifyEncryptedValues(subscription.encrypted_subscription, encryptionKeys.push_subscriptions, 'push subscriptions');
  }
  for (const setting of data.get('platform_settings') || []) {
    const key = encryptionKeys[setting.key];
    if (key) verifyEncryptedValues(setting.value, key, setting.key);
  }

  const turfs = data.get('turfs') || [];
  const photoRows = [];
  const pricingRows = [];
  for (const turf of turfs) {
    for (const photo of turf.photos || []) photoRows.push({ ...photo, turf_id: turf.id });
    for (const rule of turf.pricing_rules || []) {
      pricingRows.push({
        id: rule.id,
        turf_id: turf.id,
        day_of_week: rule.day_of_week ?? rule.dayOfWeek ?? null,
        special_date: rule.special_date ?? rule.date ?? null,
        label: rule.label || 'Shift',
        start_time: rule.start_time ?? rule.startTime,
        end_time: rule.end_time ?? rule.endTime,
        price_per_hour: rule.price_per_hour ?? rule.pricePerHour,
      });
    }
    delete turf.photos;
    delete turf.pricing_rules;
  }
  data.set('turf_photos', photoRows);
  data.set('turf_pricing_rules', pricingRows);

  const knownPolicyIds = new Set((data.get('cancellation_policies') || []).map((policy) => policy.id));
  const policyAuditRows = data.get('cancellation_policy_audit_logs') || [];
  const orphanedPolicyAuditReferences = policyAuditRows.filter(
    (row) => row.policy_id && !knownPolicyIds.has(row.policy_id),
  ).length;
  data.set('cancellation_policy_audit_logs', policyAuditRows.map((row) => (
    row.policy_id && !knownPolicyIds.has(row.policy_id)
      ? { ...row, policy_id: null, target_id: row.target_id || row.policy_id }
      : row
  )));

  const paymentListingLinks = new Map();
  const payments = (data.get('payments') || []).map((payment) => {
    const copy = { ...payment };
    if (copy.gateway_session !== undefined) {
      copy.gateway_session = copy.gateway_session;
    }
    if (copy.featured_listing_id) paymentListingLinks.set(copy.id, copy.featured_listing_id);
    return copy;
  });
  data.set('payments', payments);

  for (const [name, rows] of data) {
    if (!columnsByTable.has(name) && rows.length) throw new Error(`No PostgreSQL table exists for populated MongoDB collection ${name}.`);
    if (rows.length && !dependencyOrder.includes(name)) throw new Error(`No import order is defined for populated MongoDB collection ${name}.`);
  }
  const expectedCounts = new Map([
    ...[...data.entries()].map(([table, rows]) => [table, rows.length]),
    ['turf_photos', photoRows.length],
    ['turf_pricing_rules', pricingRows.length],
  ]);
  const identityColumn = (table) => ['platform_settings', 'feature_flags'].includes(table) ? 'key' : 'id';
  for (const [table, rows] of data) {
    if (!rows.length) continue;
    const column = identityColumn(table);
    if (rows.some((row) => row[column] === undefined || row[column] === null)) {
      throw new Error(`Cannot verify stable source identifiers in ${table}.`);
    }
  }

  const client = await pgPool.connect();
  let committed = false;
  let migrationMode = 'fresh';
  let missingTables = new Set();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = [...columnsByTable.keys()].sort();
    await client.query(`LOCK TABLE ${tables.map(quoteIdentifier).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);

    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version=16');
    if (!applied.rowCount) throw new Error('PostgreSQL migration 016 is missing; run npm run db:migrate first.');

    const allowedSeedCounts = { cancellation_policies: 1, cancellation_policy_tiers: 3 };
    const targetCounts = new Map();
    const candidateMissingTables = new Set();
    let canResume = true;
    for (const table of tables) {
      if (table === 'schema_migrations') continue;
      const count = Number((await client.query(`SELECT count(*)::int AS n FROM ${quoteIdentifier(table)}`)).rows[0].n);
      targetCounts.set(table, count);
      const expected = expectedCounts.get(table) ?? 0;
      if (count === 0 && expected > 0) {
        candidateMissingTables.add(table);
        continue;
      }
      if (count !== expected) canResume = false;
      if (count > 0 && count === expected) {
        const keyColumn = identityColumn(table);
        const expectedRows = data.get(table) || [];
        const actualRows = await client.query(`SELECT ${quoteIdentifier(keyColumn)}::text AS identity FROM ${quoteIdentifier(table)}`);
        const expectedIds = new Set(expectedRows.map((row) => String(row[keyColumn])));
        if (table === 'turf_photos') for (const row of photoRows) expectedIds.add(String(row.id));
        if (table === 'turf_pricing_rules') for (const row of pricingRows) expectedIds.add(String(row.id));
        if (actualRows.rows.length !== expectedIds.size || actualRows.rows.some((row) => !expectedIds.has(row.identity))) {
          canResume = false;
        }
      }
    }
    if (canResume) {
      migrationMode = 'resume';
      missingTables = candidateMissingTables;
    } else {
      for (const [table, count] of targetCounts) {
        if (count && allowedSeedCounts[table] !== count) {
          throw new Error(`PostgreSQL target table ${table} is not empty or does not match the MongoDB snapshot; migration stopped without changing data.`);
        }
        if (count && !Object.hasOwn(allowedSeedCounts, table)) {
          throw new Error(`PostgreSQL target table ${table} contains data; migration stopped without changing data.`);
        }
      }
      const defaultPolicy = await client.query('SELECT id FROM cancellation_policies WHERE is_default=TRUE');
      if (defaultPolicy.rowCount !== 1) throw new Error('Expected exactly one seeded PostgreSQL default cancellation policy.');
      const policyAssignments = await client.query('SELECT (SELECT count(*) FROM turf_cancellation_policies) + (SELECT count(*) FROM owner_cancellation_policies) AS n');
      if (Number(policyAssignments.rows[0].n)) throw new Error('PostgreSQL policy assignments exist; migration stopped.');
      await client.query('DELETE FROM cancellation_policy_tiers');
      await client.query('DELETE FROM cancellation_policies');
    }

    for (const table of dependencyOrder) {
      if (migrationMode === 'resume' && !missingTables.has(table)) continue;
      let rows = data.get(table) || [];
      if (table === 'featured_listings') {
        rows = rows.map((row) => {
          const copy = { ...row };
          delete copy.payment_id;
          return copy;
        });
      }
      await insertRows(client, table, rows, columnsByTable);
    }
    for (const [paymentId, listingId] of paymentListingLinks) {
      await client.query('UPDATE featured_listings SET payment_id=$1 WHERE id=$2', [paymentId, listingId]);
    }
    for (const [table, expected] of expectedCounts) {
      if (!columnsByTable.has(table)) continue;
      const actual = Number((await client.query(`SELECT count(*)::int AS n FROM ${quoteIdentifier(table)}`)).rows[0].n);
      if (actual !== expected) throw new Error(`Pre-commit reconciliation failed for ${table}: expected ${expected}, found ${actual}.`);
      if (expected > 0) {
        const column = identityColumn(table);
        const actualRows = await client.query(`SELECT ${quoteIdentifier(column)}::text AS identity FROM ${quoteIdentifier(table)}`);
        const expectedRows = table === 'turf_photos'
          ? photoRows
          : table === 'turf_pricing_rules'
            ? pricingRows
            : data.get(table) || [];
        const expectedIds = new Set(expectedRows.map((row) => String(row[column])));
        if (actualRows.rows.some((row) => !expectedIds.has(row.identity))) {
          throw new Error(`Pre-commit identity reconciliation failed for ${table}.`);
        }
      }
    }
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (!committed) throw new Error('PostgreSQL transaction did not commit.');

  console.log(`${migrationMode === 'resume' ? 'Completed' : 'Copied'} MongoDB data in PostgreSQL database "${databaseName}".`);
  console.log('Reconciled row counts and stable identifiers before commit; MongoDB source was not modified.');
  if (orphanedPolicyAuditReferences) {
    console.log(`Preserved ${orphanedPolicyAuditReferences} audit references to previously deleted policies in target_id.`);
  }
  console.log('MongoDB schema_migrations were not copied; PostgreSQL migration history remains provider-specific.');
};

try {
  await run();
} catch (error) {
  console.error(`MongoDB to PostgreSQL migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([mongoClient.close(), pgPool.end()]);
}
