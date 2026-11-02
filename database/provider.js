import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { calculateBookingAmounts, findPricingRuleForSlot } from './pricing.js';

dotenv.config();

const { Pool } = pg;
export const dbProvider = (process.env.DB_PROVIDER || 'mongodb').trim().toLowerCase();
if (!['postgres', 'mongodb'].includes(dbProvider)) {
  throw new Error('DB_PROVIDER must be either postgres or mongodb.');
}

const postgresUrl = process.env.DATABASE_URL;
const mongoUrl = process.env.MONGODB_URI;
const payoutEncryptionKey = (() => {
  const configured = process.env.PAYOUT_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try {
    const decoded = Buffer.from(configured, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch { return null; }
})();
const smtpEncryptionKey = (() => {
  const configured = process.env.SMTP_CONFIG_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try {
    const decoded = Buffer.from(configured, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch { return null; }
})();
const sslcommerzEncryptionKey = (() => {
  const configured = process.env.SSLCOMMERZ_CONFIG_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try { const decoded = Buffer.from(configured, 'base64'); return decoded.length === 32 ? decoded : null; }
  catch { return null; }
})();
const shurjopayEncryptionKey = (() => {
  const configured = process.env.SHURJOPAY_CONFIG_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try { const decoded = Buffer.from(configured, 'base64'); return decoded.length === 32 ? decoded : null; }
  catch { return null; }
})();
const uddoktapayEncryptionKey = (() => {
  const configured = process.env.UDDOKTAPAY_CONFIG_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try { const decoded = Buffer.from(configured, 'base64'); return decoded.length === 32 ? decoded : null; }
  catch { return null; }
})();
const pushSubscriptionEncryptionKey = (() => {
  const configured = process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY || '';
  if (/^[a-f\d]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  try {
    const decoded = Buffer.from(configured, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch { return null; }
})();
if (dbProvider === 'postgres' && !postgresUrl &&
    !['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].every((key) => process.env[key])) {
  throw new Error('Set DATABASE_URL or all required PGHOST/PGDATABASE/PGUSER/PGPASSWORD variables for PostgreSQL.');
}
if (dbProvider === 'mongodb' && !mongoUrl) {
  throw new Error('Set MONGODB_URI for MongoDB.');
}

const encryptPayoutDetails = (details) => {
  if (!payoutEncryptionKey) throw new Error('Set PAYOUT_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', payoutEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(details), 'utf8'), cipher.final()]);
  return { __encrypted: 'aes-256-gcm:v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};

const decryptPayoutDetails = (value) => {
  if (!value || value.__encrypted !== 'aes-256-gcm:v1') return value || {};
  if (!payoutEncryptionKey) throw new Error('PAYOUT_ENCRYPTION_KEY is required to read encrypted owner payout details.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', payoutEncryptionKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
};

const requirePayoutEncryption = () => {
  if (!payoutEncryptionKey) throw new Error('Set PAYOUT_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
};

export const migrateSensitivePayoutDetails = async () => {
  requirePayoutEncryption();
  const migrationExists = dbProvider === 'postgres'
    ? (await pool.query('SELECT 1 FROM schema_migrations WHERE version=2')).rowCount > 0
    : Boolean(await mongoDb.collection('schema_migrations').findOne({ version: 2 }));
  if (migrationExists) {
    const sample = dbProvider === 'postgres'
      ? (await pool.query('SELECT payout_details FROM turf_owner_profiles WHERE payout_details IS NOT NULL LIMIT 1')).rows[0]?.payout_details
      : (await mongoDb.collection('turf_owner_profiles').findOne({ payout_details: { $ne: null } }, { projection: { payout_details: 1 } }))?.payout_details;
    if (sample) decryptPayoutDetails(sample);
    return;
  }
  const fields = dbProvider === 'postgres'
    ? (await pool.query('SELECT user_id,payout_details FROM turf_owner_profiles WHERE payout_details IS NOT NULL')).rows
    : await mongoDb.collection('turf_owner_profiles').find({ payout_details: { $ne: null } }, { projection: { user_id: 1, payout_details: 1 } }).toArray();
  const legacy = fields.filter((profile) => profile.payout_details?.__encrypted !== 'aes-256-gcm:v1');
  for (const profile of legacy) {
    const encrypted = encryptPayoutDetails(profile.payout_details);
    if (dbProvider === 'postgres') await pool.query('UPDATE turf_owner_profiles SET payout_details=$2::jsonb,updated_at=NOW() WHERE user_id=$1', [profile.user_id, JSON.stringify(encrypted)]);
    else await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: profile.user_id }, { $set: { payout_details: encrypted, updated_at: new Date().toISOString() } });
  }
  if (dbProvider === 'postgres') await pool.query("INSERT INTO schema_migrations (version,name) VALUES (2,'002_encrypt_payout_details') ON CONFLICT (version) DO NOTHING");
  else await mongoDb.collection('schema_migrations').updateOne({ version: 2 }, { $setOnInsert: { name: '002_encrypt_payout_details', applied_at: new Date().toISOString() } }, { upsert: true });
};

const pool = dbProvider === 'postgres'
  ? new Pool(postgresUrl
    ? {
        connectionString: postgresUrl,
        ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
        max: process.env.NODE_ENV === 'production' ? 20 : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_000,
      }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'postgres',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
        max: process.env.NODE_ENV === 'production' ? 20 : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_000,
      })
  : null;

const mongoClient = dbProvider === 'mongodb' ? new MongoClient(mongoUrl, {
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
}) : null;
let mongoDb;
let ready = false;

export const connectDatabase = async () => {
  if (ready) return;
  if (dbProvider === 'postgres') {
    await pool.query('SELECT 1');
  } else {
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGODB_DATABASE || 'turfyslot');
    await ensureMongoIndexes();
    const hello = await mongoDb.command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') {
      throw new Error('MongoDB transactions require a replica set or sharded cluster (MongoDB Atlas satisfies this).');
    }
  }
  ready = true;
};

export const pingDatabase = async () => {
  if (dbProvider === 'postgres') {
    const result = await pool.query('SELECT NOW() AS now, current_database() AS database_name');
    return { provider: dbProvider, ...result.rows[0] };
  }
  const result = await mongoDb.command({ ping: 1 });
  return { provider: dbProvider, ok: result.ok === 1, database_name: mongoDb.databaseName };
};

export const wipeApplicationDataPreservingAdmins = async () => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tables = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('users', 'schema_migrations', 'platform_settings') ORDER BY tablename`
      );
      if (tables.rows.length) {
        const tableList = tables.rows.map(({ tablename }) => `public."${String(tablename).replace(/"/g, '""')}"`).join(', ');
        await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
      }
      const removedUsers = await client.query("DELETE FROM users WHERE role <> 'admin'");
      await client.query("DELETE FROM platform_settings WHERE key NOT IN ('sslcommerz_config', 'shurjopay_config', 'uddoktapay_config', 'smtp_configs', 'gateway_fee_rate', 'gateway_fee_enabled', 'public_api_base_url')");
      await client.query('COMMIT');
      return { provider: dbProvider, removedAccounts: removedUsers.rowCount, clearedCollections: tables.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const collections = (await mongoDb.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('system.') && !['users', 'schema_migrations', 'platform_settings'].includes(name));
  const session = mongoClient.startSession();
  try {
    let removedAccounts = 0;
    await session.withTransaction(async () => {
      const result = await mongoDb.collection('users').deleteMany({ role: { $ne: 'admin' } }, { session });
      removedAccounts = result.deletedCount;
      for (const name of collections) await mongoDb.collection(name).deleteMany({}, { session });
      await mongoDb.collection('platform_settings').deleteMany(
        { key: { $nin: ['sslcommerz_config', 'shurjopay_config', 'uddoktapay_config', 'smtp_configs', 'gateway_fee_rate', 'gateway_fee_enabled', 'public_api_base_url'] } },
        { session }
      );
    });
    return { provider: dbProvider, removedAccounts, clearedCollections: collections.length };
  } finally {
    await session.endSession();
  }
};

export const findUserById = async (id) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] || null;
  }
  return mongoDb.collection('users').findOne({ id });
};

export const findUserByEmail = async (email) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    return result.rows[0] || null;
  }
  return mongoDb.collection('users').findOne({ email });
};

export const updateUserAvatar = async (userId, avatar) => {
  const updatedAt = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query('UPDATE users SET avatar=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [userId, avatar]);
    return result.rows[0] || null;
  }
  return mongoDb.collection('users').findOneAndUpdate(
    { id: userId },
    { $set: { avatar, updated_at: updatedAt } },
    { returnDocument: 'after' }
  );
};

export const createUserNotification = async ({ userId, type, title, message, data = {} }) => {
  if (!userId || !['booking', 'payment', 'refund', 'approval', 'system', 'dispute'].includes(type)) throw new Error('Invalid notification recipient or type.');
  if (!String(title || '').trim() || String(title).length > 200 || !String(message || '').trim() || String(message).length > 5000) throw new Error('Notification title or message is invalid.');
  const eventKey = typeof data.eventKey === 'string' ? data.eventKey : '';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `INSERT INTO notifications (id,user_id,type,title,message,data,created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW()) ON CONFLICT DO NOTHING RETURNING id,user_id,type,title,message,data,read_at,created_at`,
      [id, userId, type, String(title).trim(), String(message).trim(), JSON.stringify(data)]
    );
    if (result.rows[0]) return { ...result.rows[0], wasCreated: true };
    if (eventKey) {
      const existing = (await pool.query("SELECT id,user_id,type,title,message,data,read_at,created_at FROM notifications WHERE user_id=$1 AND data->>'eventKey'=$2 LIMIT 1", [userId, eventKey])).rows[0];
      return existing ? { ...existing, wasCreated: false } : null;
    }
    return null;
  }
  const collection = mongoDb.collection('notifications');
  if (eventKey) {
    const existing = await collection.findOne({ user_id: userId, 'data.eventKey': eventKey });
    if (existing) return { ...existing, wasCreated: false };
  }
  const notification = { id, user_id: userId, type, title: String(title).trim(), message: String(message).trim(), data, read_at: null, created_at: now };
  try { await collection.insertOne(notification); return { ...notification, wasCreated: true }; }
  catch (error) {
    if (eventKey && error.code === 11000) {
      const existing = await collection.findOne({ user_id: userId, 'data.eventKey': eventKey });
      return existing ? { ...existing, wasCreated: false } : null;
    }
    throw error;
  }
};

export const listUserNotifications = async (userId, limit = 100) => {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  if (dbProvider === 'postgres') return (await pool.query(
    'SELECT id,user_id,type,title,message,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, safeLimit]
  )).rows;
  return mongoDb.collection('notifications').find({ user_id: userId }).sort({ created_at: -1 }).limit(safeLimit).toArray();
};

export const markUserNotificationRead = async ({ userId, notificationId }) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id', [notificationId, userId]);
    return result.rowCount > 0;
  }
  const result = await mongoDb.collection('notifications').updateOne({ id: notificationId, user_id: userId }, { $set: { read_at: new Date().toISOString() } });
  return result.matchedCount > 0;
};

export const listPlayerFavorites = async (playerId) => {
  if (dbProvider === 'postgres') {
    return (await pool.query('SELECT turf_id FROM favorites WHERE player_id=$1 ORDER BY created_at DESC', [playerId])).rows.map((row) => row.turf_id);
  }
  return (await mongoDb.collection('favorites').find({ player_id: playerId }).sort({ created_at: -1 }).project({ turf_id: 1, _id: 0 }).toArray()).map((row) => row.turf_id);
};

export const setPlayerFavorite = async ({ playerId, turfId, isFavorite }) => {
  if (typeof isFavorite !== 'boolean') throw new Error('Favorite state must be a boolean.');
  if (isFavorite) {
    if (dbProvider === 'postgres') {
      const result = await pool.query(
        `INSERT INTO favorites (player_id,turf_id)
         SELECT $1,t.id FROM turfs t JOIN users u ON u.id=t.owner_id
         JOIN turf_owner_profiles p ON p.user_id=u.id
         WHERE t.id=$2 AND t.status='active' AND t.deleted_at IS NULL
           AND u.status='active' AND p.approval_status='active'
         ON CONFLICT (player_id,turf_id) DO NOTHING RETURNING turf_id`,
        [playerId, turfId]
      );
      if (result.rowCount === 0) {
        const existing = await pool.query('SELECT 1 FROM favorites WHERE player_id=$1 AND turf_id=$2', [playerId, turfId]);
        if (existing.rowCount === 0) throw new Error('Active turf not found.');
      }
      return true;
    }
    const turf = await mongoDb.collection('turfs').findOne({
      id: turfId,
      status: 'active',
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    });
    const owner = turf && await mongoDb.collection('users').findOne({ id: turf.owner_id, status: 'active' });
    if (!turf || !owner || !await mongoDb.collection('turf_owner_profiles').findOne({ user_id: turf.owner_id, approval_status: 'active' })) {
      throw new Error('Active turf not found.');
    }
    await mongoDb.collection('favorites').updateOne(
      { player_id: playerId, turf_id: turfId },
      { $setOnInsert: { id: crypto.randomUUID(), player_id: playerId, turf_id: turfId, created_at: new Date().toISOString() } },
      { upsert: true }
    );
    return true;
  }
  if (dbProvider === 'postgres') {
    await pool.query('DELETE FROM favorites WHERE player_id=$1 AND turf_id=$2', [playerId, turfId]);
  } else {
    await mongoDb.collection('favorites').deleteOne({ player_id: playerId, turf_id: turfId });
  }
  return true;
};

export const savePushSubscription = async ({ userId, subscription }) => {
  const endpoint = String(subscription?.endpoint || '');
  const p256dh = String(subscription?.keys?.p256dh || '');
  const auth = String(subscription?.keys?.auth || '');
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch { throw new Error('Invalid Web Push subscription endpoint.'); }
  if (endpointUrl.protocol !== 'https:' || endpoint.length > 2048 || !p256dh || p256dh.length > 256 || !auth || auth.length > 256) throw new Error('Invalid Web Push subscription.');
  const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
  const encrypted = encryptPushSubscription({ endpoint, keys: { p256dh, auth } });
  if (dbProvider === 'postgres') {
    await pool.query(
      `INSERT INTO push_subscriptions (id,user_id,endpoint_hash,encrypted_subscription) VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (endpoint_hash) DO UPDATE SET user_id=EXCLUDED.user_id,encrypted_subscription=EXCLUDED.encrypted_subscription`,
      [crypto.randomUUID(), userId, endpointHash, JSON.stringify(encrypted)]
    );
  } else {
    await mongoDb.collection('push_subscriptions').updateOne(
      { endpoint_hash: endpointHash },
      { $set: { user_id: userId, encrypted_subscription: encrypted }, $setOnInsert: { id: crypto.randomUUID(), endpoint_hash: endpointHash, created_at: new Date().toISOString() } },
      { upsert: true }
    );
  }
  return { endpointHash };
};

export const listUserPushSubscriptions = async (userId) => {
  if (dbProvider === 'postgres') {
    return (await pool.query('SELECT endpoint_hash,encrypted_subscription FROM push_subscriptions WHERE user_id=$1', [userId])).rows
      .map((row) => ({ endpointHash: row.endpoint_hash, subscription: decryptPushSubscription(row.encrypted_subscription) }));
  }
  return (await mongoDb.collection('push_subscriptions').find({ user_id: userId }, { projection: { endpoint_hash: 1, encrypted_subscription: 1 } }).toArray())
    .map((row) => ({ endpointHash: row.endpoint_hash, subscription: decryptPushSubscription(row.encrypted_subscription) }));
};

export const deleteUserPushSubscription = async ({ userId, endpointHash }) => {
  if (!/^[a-f\d]{64}$/i.test(String(endpointHash))) return false;
  if (dbProvider === 'postgres') return (await pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2 RETURNING id', [userId, endpointHash])).rowCount > 0;
  return (await mongoDb.collection('push_subscriptions').deleteOne({ user_id: userId, endpoint_hash: endpointHash })).deletedCount > 0;
};

export const createAuthCode = async ({ userId, purpose, codeHash, lifetimeMinutes = 15 }) => {
  if (!['email_verification', 'password_reset'].includes(purpose)) throw new Error('Invalid authentication code purpose.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!lock.rowCount) { await client.query('ROLLBACK'); return false; }
      const recent = await client.query("SELECT 1 FROM auth_codes WHERE user_id=$1 AND purpose=$2 AND created_at > NOW()-INTERVAL '60 seconds' LIMIT 1", [userId, purpose]);
      if (recent.rowCount) { await client.query('COMMIT'); return false; }
      await client.query('UPDATE auth_codes SET consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL', [userId, purpose]);
      await client.query('INSERT INTO auth_codes (user_id,purpose,code_hash,expires_at) VALUES ($1,$2,$3,NOW()+($4 * INTERVAL \'1 minute\'))', [userId, purpose, codeHash, lifetimeMinutes]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let created = false;
    await session.withTransaction(async () => {
      const users = mongoDb.collection('users');
      const locked = await users.updateOne({ id: userId }, { $inc: { auth_code_issue_version: 1 } }, { session });
      if (!locked.matchedCount) return;
      const codes = mongoDb.collection('auth_codes');
      const recent = await codes.findOne({ user_id: userId, purpose, created_at: { $gt: new Date(Date.now() - 60_000) } }, { session });
      if (recent) return;
      const now = new Date();
      await codes.updateMany({ user_id: userId, purpose, consumed_at: null }, { $set: { consumed_at: now } }, { session });
      await codes.insertOne({ id: crypto.randomUUID(), user_id: userId, purpose, code_hash: codeHash, attempts: 0, expires_at: new Date(now.getTime() + lifetimeMinutes * 60_000), consumed_at: null, created_at: now }, { session });
      created = true;
    });
    return created;
  } finally { await session.endSession(); }
};

export const invalidateAuthCodes = async (userId, purpose) => {
  if (dbProvider === 'postgres') {
    await pool.query('UPDATE auth_codes SET consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL', [userId, purpose]);
    return;
  }
  await mongoDb.collection('auth_codes').updateMany({ user_id: userId, purpose, consumed_at: null }, { $set: { consumed_at: new Date() } });
};

export const consumeAuthCode = async ({ userId, purpose, codeHash, passwordHash }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM auth_codes WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [userId, purpose]);
      const code = found.rows[0];
      if (!code || code.attempts >= 5) { await client.query('COMMIT'); return false; }
      if (code.code_hash !== codeHash) {
        await client.query('UPDATE auth_codes SET attempts=attempts+1,consumed_at=CASE WHEN attempts+1>=5 THEN NOW() ELSE consumed_at END WHERE id=$1', [code.id]);
        await client.query('COMMIT');
        return false;
      }
      await client.query('UPDATE auth_codes SET consumed_at=NOW() WHERE id=$1', [code.id]);
      if (purpose === 'email_verification') await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()),updated_at=NOW() WHERE id=$1', [userId]);
      else await client.query('UPDATE users SET password_hash=$2,token_version=token_version+1,updated_at=NOW() WHERE id=$1', [userId, passwordHash]);
      await client.query('UPDATE auth_codes SET consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL', [userId, purpose]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let accepted = false;
    await session.withTransaction(async () => {
      const codes = mongoDb.collection('auth_codes');
      const code = await codes.find({ user_id: userId, purpose, consumed_at: null, expires_at: { $gt: new Date() } }, { session }).sort({ created_at: -1 }).limit(1).next();
      if (!code || code.attempts >= 5) return;
      if (code.code_hash !== codeHash) {
        await codes.updateOne({ id: code.id, consumed_at: null }, { $inc: { attempts: 1 }, $set: code.attempts + 1 >= 4 ? { consumed_at: new Date() } : {} }, { session });
        return;
      }
      const now = new Date();
      await codes.updateMany({ user_id: userId, purpose, consumed_at: null }, { $set: { consumed_at: now } }, { session });
      if (purpose === 'email_verification') await mongoDb.collection('users').updateOne({ id: userId }, { $set: { email_verified_at: now.toISOString(), updated_at: now.toISOString() } }, { session });
      else await mongoDb.collection('users').updateOne({ id: userId }, { $set: { password_hash: passwordHash, updated_at: now.toISOString() }, $inc: { token_version: 1 } }, { session });
      accepted = true;
    });
    return accepted;
  } finally { await session.endSession(); }
};

export const createAdminAccount = async ({ name, email, passwordHash }) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `INSERT INTO users (name,email,password_hash,role,status) VALUES ($1,$2,$3,'admin','active')
       ON CONFLICT (email) DO NOTHING RETURNING id`, [name, email, passwordHash]
    );
    if (!result.rowCount) throw new Error('An account with that email already exists; no admin role was changed.');
    return result.rows[0].id;
  }
  const result = await mongoDb.collection('users').insertOne({
    id: crypto.randomUUID(), name, email, password_hash: passwordHash, role: 'admin', status: 'active',
    token_version: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  return result.insertedId;
};

export const listUsersForAdmin = async ({ search = '', role = '', status = '' }) => {
  const term = search.trim();
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT id,name,email,phone,role,status,avatar,created_at FROM users
       WHERE ($1='' OR name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%')
       AND ($2='' OR role=$2) AND ($3='' OR status=$3) ORDER BY created_at DESC LIMIT 250`, [term, role, status]
    );
    return result.rows;
  }
  const filter = {};
  if (term) filter.$or = ['name', 'email', 'phone'].map((key) => ({ [key]: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }));
  if (role) filter.role = role;
  if (status) filter.status = status;
  return mongoDb.collection('users').find(filter, { projection: { password_hash: 0 } }).sort({ created_at: -1 }).limit(250).toArray();
};

export const changeUserStatus = async ({ userId, status, adminId, reason }) => {
  if (!['active', 'suspended', 'deactivated'].includes(status)) throw new Error('Invalid account status.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT id,role,status,token_version FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!before.rowCount) { await client.query('ROLLBACK'); return null; }
      const updated = await client.query('UPDATE users SET status=$2,token_version=token_version+1,updated_at=NOW() WHERE id=$1 RETURNING id,name,email,phone,role,status,created_at', [userId, status]);
      await client.query('INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value) VALUES ($1,\'admin\',$2,\'user\',$3,$4,$5::jsonb,$6::jsonb)', [adminId, `user_${status}`, userId, reason || null, JSON.stringify({ status: before.rows[0].status }), JSON.stringify({ status })]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const user = await mongoDb.collection('users').findOne({ id: userId });
  if (!user) return null;
  const now = new Date().toISOString();
  await mongoDb.collection('users').updateOne({ id: userId }, { $set: { status, updated_at: now }, $inc: { token_version: 1 } });
  await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: `user_${status}`, entity_type: 'user', entity_id: userId, reason: reason || null, before_value: { status: user.status }, after_value: { status }, created_at: now });
  return { ...user, status, token_version: Number(user.token_version || 0) + 1, password_hash: undefined };
};

export const findOwnerProfile = async (userId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query('SELECT * FROM turf_owner_profiles WHERE user_id=$1 LIMIT 1', [userId]);
    return result.rows[0] ? { ...result.rows[0], payout_details: decryptPayoutDetails(result.rows[0].payout_details) } : null;
  }
  const profile = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: userId });
  return profile ? { ...profile, payout_details: decryptPayoutDetails(profile.payout_details) } : null;
};

export const updateOwnerPayoutDetails = async ({ ownerId, payoutMethod, payoutDetails }) => {
  if (!['bkash', 'nagad', 'rocket', 'bank_account'].includes(payoutMethod)) throw new Error('Choose a supported payout method.');
  const accountNumber = String(payoutDetails?.accountNumber || '').trim();
  if (!accountNumber || accountNumber.length > 100) throw new Error('Provide a valid payout account or wallet number.');
  const details = { ...payoutDetails, accountNumber };
  const encrypted = encryptPayoutDetails(details);
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query("SELECT payout_method,payout_details FROM turf_owner_profiles WHERE user_id=$1 AND approval_status='active' FOR UPDATE", [ownerId]);
      if (!prior.rowCount) throw new Error('Approved owner profile was not found.');
      const updated = await client.query('UPDATE turf_owner_profiles SET payout_method=$2,payout_details=$3::jsonb,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,payout_method,payout_details', [ownerId, payoutMethod, JSON.stringify(encrypted)]);
      await client.query(`INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,before_value,after_value)
        VALUES ($1,'turf_owner','payout_details_updated','owner_profile',$1,$2::jsonb,$3::jsonb)`, [ownerId,
        JSON.stringify({ method: prior.rows[0].payout_method, accountLast4: String(decryptPayoutDetails(prior.rows[0].payout_details).accountNumber || '').slice(-4) }),
        JSON.stringify({ method: payoutMethod, accountLast4: accountNumber.slice(-4) })]);
      await client.query('COMMIT');
      return { ...updated.rows[0], payout_details: decryptPayoutDetails(updated.rows[0].payout_details) };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const prior = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'active' }, { session });
      if (!prior) throw new Error('Approved owner profile was not found.');
      const now = new Date().toISOString();
      await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: ownerId }, { $set: { payout_method: payoutMethod, payout_details: encrypted, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'payout_details_updated', entity_type: 'owner_profile', entity_id: ownerId, before_value: { method: prior.payout_method, accountLast4: String(decryptPayoutDetails(prior.payout_details).accountNumber || '').slice(-4) }, after_value: { method: payoutMethod, accountLast4: accountNumber.slice(-4) }, created_at: now }, { session });
      result = { ...prior, payout_method: payoutMethod, payout_details: details, updated_at: now };
    });
    return result;
  } finally { await session.endSession(); }
};

export const listPendingOwners = async () => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT u.id AS user_id, u.name, u.email, u.phone, u.created_at,
        op.id AS profile_id, op.business_name, op.nid_or_trade_license,
        op.business_documents, op.payout_method, op.payout_details, op.approval_status, op.review_message
       FROM users u JOIN turf_owner_profiles op ON op.user_id=u.id
       WHERE u.role='turf_owner' AND u.status='pending_approval' AND op.approval_status='pending_approval'
       ORDER BY u.created_at ASC`
    );
    return result.rows.map((row) => ({ ...row, payout_details: decryptPayoutDetails(row.payout_details) }));
  }
  const profiles = await mongoDb.collection('turf_owner_profiles').find({ approval_status: 'pending_approval' }).sort({ created_at: 1 }).toArray();
  const users = await mongoDb.collection('users').find({ role: 'turf_owner', status: 'pending_approval' }).toArray();
  const usersById = new Map(users.map((user) => [user.id, user]));
  return profiles.filter((profile) => usersById.has(profile.user_id)).map((profile) => ({ ...usersById.get(profile.user_id), ...profile, payout_details: decryptPayoutDetails(profile.payout_details), user_id: profile.user_id }));
};

export const requestOwnerCorrections = async ({ ownerId, adminId, message }) => {
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query("SELECT approval_status,review_message FROM turf_owner_profiles WHERE user_id=$1 FOR UPDATE", [ownerId]);
      if (!prior.rows[0] || prior.rows[0].approval_status !== 'pending_approval') { await client.query('ROLLBACK'); return null; }
      await client.query('UPDATE turf_owner_profiles SET review_message=$2,updated_at=NOW() WHERE user_id=$1', [ownerId, message]);
      await client.query(`INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value) VALUES ($1,'admin','owner_corrections_requested','turf_owner_profile',$2,$3,$4::jsonb,$5::jsonb)`, [adminId, ownerId, message, JSON.stringify({ reviewMessage: prior.rows[0].review_message }), JSON.stringify({ reviewMessage: message })]);
      await client.query('COMMIT');
      return { ownerId, reviewMessage: message };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const profile = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'pending_approval' }, { session });
      if (!profile) return;
      await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: ownerId }, { $set: { review_message: message, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'owner_corrections_requested', entity_type: 'turf_owner_profile', entity_id: ownerId, reason: message, before_value: { reviewMessage: profile.review_message || null }, after_value: { reviewMessage: message }, created_at: now }, { session });
      result = { ownerId, reviewMessage: message };
    });
    return result;
  } finally { await session.endSession(); }
};

export const updatePendingOwnerVerification = async ({ ownerId, tradeLicenseNumber, businessDocuments }) => {
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query("SELECT * FROM turf_owner_profiles WHERE user_id=$1 AND approval_status='pending_approval' FOR UPDATE", [ownerId]);
      if (!prior.rows[0]) { await client.query('ROLLBACK'); return null; }
      if (!businessDocuments.some((document) => document.document_type === 'trade_license')) { await client.query('ROLLBACK'); throw new Error('A trade license document is required.'); }
      await client.query('UPDATE turf_owner_profiles SET nid_or_trade_license=$2,business_documents=$3::jsonb,review_message=NULL,updated_at=NOW() WHERE user_id=$1', [ownerId, tradeLicenseNumber, JSON.stringify(businessDocuments)]);
      await client.query(`INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,before_value,after_value) VALUES ($1,'turf_owner','owner_verification_updated','turf_owner_profile',$1,$2::jsonb,$3::jsonb)`, [ownerId, JSON.stringify({ tradeLicenseNumber: prior.rows[0].nid_or_trade_license }), JSON.stringify({ tradeLicenseNumber })]);
      await client.query('COMMIT');
      return { previousDocuments: prior.rows[0].business_documents || [], businessDocuments, tradeLicenseNumber };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const prior = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'pending_approval' }, { session });
      if (!prior) return;
      if (!businessDocuments.some((document) => document.document_type === 'trade_license')) throw new Error('A trade license document is required.');
      await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: ownerId, approval_status: 'pending_approval' }, { $set: { nid_or_trade_license: tradeLicenseNumber, business_documents: businessDocuments, review_message: null, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'owner_verification_updated', entity_type: 'turf_owner_profile', entity_id: ownerId, before_value: { tradeLicenseNumber: prior.nid_or_trade_license }, after_value: { tradeLicenseNumber }, created_at: now }, { session });
      result = { previousDocuments: prior.business_documents || [], businessDocuments, tradeLicenseNumber };
    });
    return result;
  } finally { await session.endSession(); }
};

export const findOwnerDocument = async (ownerId, documentId) => {
  const profile = await findOwnerProfile(ownerId);
  return (profile?.business_documents || []).find((document) => document.id === documentId) || null;
};

export const reviewOwnerAccount = async ({ ownerId, adminId, approve, reason }) => {
  const settings = await readAdminSettings();
  const subscriptionAmount = Number(settings.monthly_subscription_amount || 0);
  if (approve && subscriptionAmount <= 0) {
    const billingProfile = await findOwnerProfile(ownerId);
    if (billingProfile?.billing_model === 'monthly_subscription') throw new Error('Set a monthly subscription amount before approving this owner.');
  }
  const initialDueDate = monthEndForDate(getDhakaDateString());
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT op.*, u.status AS user_status FROM turf_owner_profiles op
         JOIN users u ON u.id=op.user_id WHERE op.user_id=$1 FOR UPDATE OF op, u`, [ownerId]
      );
      const profile = found.rows[0];
      if (!profile || profile.approval_status !== 'pending_approval') {
        await client.query('ROLLBACK');
        return null;
      }
      const documents = profile.business_documents || [];
      if (approve && !documents.some((document) => document.document_type === 'trade_license')) {
        await client.query('ROLLBACK');
        return { missingDocument: true };
      }
      const newStatus = approve ? 'active' : 'rejected';
      await client.query(
        `UPDATE turf_owner_profiles SET approval_status=$2::varchar, approved_by=$3, approved_at=NOW(),
           subscription_due_date=CASE WHEN $2::varchar='active' AND billing_model='monthly_subscription' THEN $4::date ELSE subscription_due_date END,
            subscription_due_amount=CASE WHEN $2::varchar='active' AND billing_model='monthly_subscription' THEN NULL ELSE subscription_due_amount END,
           updated_at=NOW() WHERE user_id=$1`,
          [ownerId, newStatus, adminId, initialDueDate]
      );
      await client.query('UPDATE users SET status=$2, updated_at=NOW() WHERE id=$1', [ownerId, approve ? 'active' : 'suspended']);
      await client.query(
        `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, reason, before_value, after_value)
         VALUES ($1, 'admin', $2, 'turf_owner_profile', $3, $4, $5::jsonb, $6::jsonb)`,
        [adminId, approve ? 'owner_approved' : 'owner_rejected', ownerId, reason || null,
          JSON.stringify({ approvalStatus: profile.approval_status, userStatus: profile.user_status }),
          JSON.stringify({ approvalStatus: newStatus, userStatus: approve ? 'active' : 'suspended' })]
      );
      await client.query('COMMIT');
      return { ownerId, approvalStatus: newStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const session = mongoClient.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const profile = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'pending_approval' }, { session });
      if (!profile) return;
      const documents = profile.business_documents || [];
      if (approve && !documents.some((document) => document.document_type === 'trade_license')) {
        result = { missingDocument: true };
        return;
      }
      const approvalStatus = approve ? 'active' : 'rejected';
      const userStatus = approve ? 'active' : 'suspended';
      await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: ownerId, approval_status: 'pending_approval' }, {
        $set: {
          approval_status: approvalStatus, approved_by: adminId, approved_at: new Date().toISOString(),
          ...(approve && profile.billing_model === 'monthly_subscription' ? { subscription_due_date: initialDueDate, subscription_due_amount: null } : {}),
        },
      }, { session });
      await mongoDb.collection('users').updateOne({ id: ownerId, status: 'pending_approval' }, { $set: { status: userStatus } }, { session });
      await mongoDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin',
        action: approve ? 'owner_approved' : 'owner_rejected', entity_type: 'turf_owner_profile',
        entity_id: ownerId, reason: reason || null,
        before_value: { approvalStatus: 'pending_approval', userStatus: 'pending_approval' },
        after_value: { approvalStatus, userStatus }, created_at: new Date().toISOString(),
      }, { session });
      result = { ownerId, approvalStatus };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export const rotateTokenVersion = async (userId, expectedVersion) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `UPDATE users SET token_version=token_version+1, updated_at=NOW()
       WHERE id=$1 AND token_version=$2 RETURNING *`, [userId, expectedVersion]
    );
    return result.rows[0] || null;
  }
  const versionFilter = expectedVersion === 0
    ? { $or: [{ token_version: 0 }, { token_version: { $exists: false } }] }
    : { token_version: expectedVersion };
  const result = await mongoDb.collection('users').findOneAndUpdate(
    { id: userId, ...versionFilter },
    { $inc: { token_version: 1 }, $set: { updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  return result;
};

export const updateUnverifiedPlayerEmail = async ({ userId, email }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 255) throw new Error('Enter a valid email address.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query("SELECT * FROM users WHERE id=$1 AND role='player' FOR UPDATE", [userId]);
      const user = found.rows[0];
      if (!user) throw new Error('Only a player account can update its email.');
      if (user.email_verified_at) throw new Error('Verified email addresses cannot be changed through this recovery flow.');
      if (user.email.toLowerCase() === normalizedEmail) throw new Error('Enter a different email address.');
      const duplicate = await client.query('SELECT 1 FROM users WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1', [normalizedEmail, userId]);
      if (duplicate.rowCount) throw new Error('That email address is already registered.');
      const updated = await client.query('UPDATE users SET email=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [userId, normalizedEmail]);
      await client.query("UPDATE auth_codes SET consumed_at=NOW() WHERE user_id=$1 AND purpose='email_verification' AND consumed_at IS NULL", [userId]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new Error('That email address is already registered.');
      throw error;
    } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let updatedUser = null;
    await session.withTransaction(async () => {
      const users = mongoDb.collection('users');
      const user = await users.findOne({ id: userId, role: 'player' }, { session });
      if (!user) throw new Error('Only a player account can update its email.');
      if (user.email_verified_at) throw new Error('Verified email addresses cannot be changed through this recovery flow.');
      if (String(user.email).toLowerCase() === normalizedEmail) throw new Error('Enter a different email address.');
      if (await users.findOne({ email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, id: { $ne: userId } }, { session, projection: { _id: 1 } })) throw new Error('That email address is already registered.');
      const result = await users.findOneAndUpdate({ id: userId, role: 'player', email_verified_at: { $in: [null] } }, { $set: { email: normalizedEmail, updated_at: new Date().toISOString() } }, { session, returnDocument: 'after' });
      if (!result) throw new Error('This account can no longer change its email.');
      await mongoDb.collection('auth_codes').updateMany({ user_id: userId, purpose: 'email_verification', consumed_at: null }, { $set: { consumed_at: new Date() } }, { session });
      updatedUser = result;
    });
    return updatedUser;
  } catch (error) {
    if (error.code === 11000) throw new Error('That email address is already registered.');
    throw error;
  } finally { await session.endSession(); }
};

export const createPlayerAccount = async ({ name, email, phone, passwordHash }) => {
  const user = {
    id: crypto.randomUUID(), name, email, phone, password_hash: passwordHash,
    role: 'player', status: 'active', token_version: 0, created_at: new Date().toISOString(),
  };
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, 'player', 'active') RETURNING *`,
      [user.id, name, email, phone, passwordHash]
    );
    return result.rows[0];
  }
  await mongoDb.collection('users').insertOne(user);
  return user;
};

const getDhakaDateString = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const monthEndForDate = (dateString) => {
  const [year, month] = String(dateString).split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
const nextMonthEnd = (dateString) => {
  const [year, month] = String(dateString).split('-').map(Number);
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
};
const addCalendarDays = (dateString, days) => {
  const [year, month, day] = String(dateString).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const firstOfNextMonth = (dateString) => {
  const [year, month] = String(dateString).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

export const createOwnerAccount = async ({ name, email, phone, passwordHash, businessName, tradeLicenseNumber, businessDocuments, payoutMethod, payoutDetails, billingModel }) => {
  requirePayoutEncryption();
  if (!['commission', 'monthly_subscription'].includes(billingModel)) throw new Error('Choose a valid owner billing model.');
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const user = {
    id: userId, name, email, phone, password_hash: passwordHash,
    role: 'turf_owner', status: 'pending_approval', token_version: 0, created_at: now,
  };
  const profile = {
    id: crypto.randomUUID(), user_id: userId, business_name: businessName,
    nid_or_trade_license: tradeLicenseNumber, business_documents: businessDocuments,
    payout_method: payoutMethod, payout_details: encryptPayoutDetails(payoutDetails),
    approval_status: 'pending_approval', billing_model: billingModel, created_at: now,
  };

  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertedUser = await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'turf_owner', 'pending_approval') RETURNING *`,
        [userId, name, email, phone, passwordHash]
      );
      await client.query(
        `INSERT INTO turf_owner_profiles (id, user_id, business_name, nid_or_trade_license, business_documents,
           payout_method, payout_details, approval_status, billing_model)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_approval', $8)`,
        [profile.id, userId, businessName, tradeLicenseNumber, JSON.stringify(businessDocuments), payoutMethod, JSON.stringify(profile.payout_details), billingModel]
      );
      await client.query('INSERT INTO wallets (owner_id, available_balance, updated_at) VALUES ($1, 0, NOW())', [userId]);
      await client.query('COMMIT');
      return insertedUser.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await mongoDb.collection('users').insertOne(user, { session });
      await mongoDb.collection('turf_owner_profiles').insertOne(profile, { session });
      await mongoDb.collection('wallets').insertOne({
        id: crypto.randomUUID(), owner_id: userId, available_balance: 0, held_balance: 0, created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return user;
};

export const listPublicTurfs = async (filters = {}) => {
  if (dbProvider === 'postgres') {
  const where = ["t.status='active'", "t.deleted_at IS NULL", "op.approval_status='active'", "u.status='active'", "EXISTS (SELECT 1 FROM jsonb_each(COALESCE((t.operating_hours::jsonb)->'days','{}'::jsonb)) AS weekly(weekday, day) WHERE jsonb_typeof(weekly.day->'slots')='array' AND jsonb_array_length(weekly.day->'slots')>0)"];
    const values = [];
    const add = (sql, value) => { values.push(value); where.push(sql.replaceAll('?', `$${values.length}`)); };
    const search = String(filters.search || '').trim();
    if (search) add("(t.name ILIKE '%'||?||'%' OR t.area ILIKE '%'||?||'%' OR t.city ILIKE '%'||?||'%')", search);
    if (filters.area) add('t.area ILIKE ?', `%${String(filters.area)}%`);
    if (filters.city) add('t.city ILIKE ?', `%${String(filters.city)}%`);
    if (filters.sport) add('?=ANY(t.sport_types)', String(filters.sport));
    if (filters.minPrice !== undefined) add('t.base_price_per_hour >= ?', Number(filters.minPrice));
    if (filters.maxPrice !== undefined) add('t.base_price_per_hour <= ?', Number(filters.maxPrice));
    if (filters.minRating !== undefined) add('t.rating >= ?', Number(filters.minRating));
    const result = await pool.query(
      `SELECT t.id, t.owner_id, u.name AS owner_name, t.name, t.description,
        t.address, t.area, t.city, t.latitude, t.longitude, t.sport_types,
        t.amenities, t.base_price_per_hour, t.operating_hours, t.status,
        t.rating, t.review_count, t.created_at, op.billing_model AS owner_billing_model,
        (SELECT json_build_object('id', p.id, 'name', p.name, 'isDefault', p.is_default,
          'tiers', COALESCE((SELECT json_agg(json_build_object('id', tier.id,
            'minHoursBefore', tier.hours_before_start_min, 'maxHoursBefore', tier.hours_before_start_max,
            'refundPercentage', tier.refund_percentage) ORDER BY tier.sort_order)
            FROM cancellation_policy_tiers tier WHERE tier.policy_id=p.id), '[]'::json))
         FROM cancellation_policies p WHERE p.id=COALESCE(
           (SELECT policy_id FROM turf_cancellation_policies WHERE turf_id=t.id),
           (SELECT policy_id FROM owner_cancellation_policies WHERE owner_id=t.owner_id),
           (SELECT id FROM cancellation_policies WHERE is_default=TRUE AND is_active=TRUE LIMIT 1))) AS effective_cancellation_policy,
        COALESCE((SELECT json_agg(json_build_object('id', tp.id, 'url', tp.url, 'sort_order', tp.sort_order)
          ORDER BY tp.sort_order) FROM turf_photos tp WHERE tp.turf_id = t.id), '[]'::json) AS photos,
        COALESCE((SELECT json_agg(json_build_object('id', pr.id, 'label', pr.label, 'dayOfWeek', pr.day_of_week, 'date', pr.special_date,
          'startTime', pr.start_time, 'endTime', pr.end_time, 'pricePerHour', pr.price_per_hour))
          FROM turf_pricing_rules pr WHERE pr.turf_id = t.id), '[]'::json) AS pricing_rules
       FROM turfs t JOIN users u ON u.id = t.owner_id
       JOIN turf_owner_profiles op ON op.user_id = t.owner_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.rating DESC,t.created_at DESC LIMIT 100`, values
    );
    return result.rows;
  }
  const [turfs, profiles, users] = await Promise.all([
    mongoDb.collection('turfs').find({
      status: 'active',
      $or: [{ deleted_at: { $exists: false } }, { deleted_at: null }],
    }).toArray(),
    mongoDb.collection('turf_owner_profiles').find({ approval_status: 'active' }).toArray(),
    mongoDb.collection('users').find({ status: 'active' }, { projection: { id: 1, name: 1 } }).toArray(),
  ]);
  const profileOwnerIds = new Set(profiles.map((profile) => profile.user_id));
  const billingModels = new Map(profiles.map((profile) => [profile.user_id, profile.billing_model || 'commission']));
  const names = new Map(users.map((user) => [user.id, user.name]));
  let results = turfs
    .filter((turf) => profileOwnerIds.has(turf.owner_id) && hasConfiguredWeeklySlots(turf.operating_hours))
    .map((turf) => ({ ...turf, owner_name: names.get(turf.owner_id) || '', owner_billing_model: billingModels.get(turf.owner_id) || 'commission' }));
  const contains = (value, filter) => String(value || '').toLowerCase().includes(String(filter || '').toLowerCase());
  if (filters.search) results = results.filter((turf) => contains(turf.name, filters.search) || contains(turf.area, filters.search) || contains(turf.city, filters.search));
  if (filters.area) results = results.filter((turf) => contains(turf.area, filters.area));
  if (filters.city) results = results.filter((turf) => contains(turf.city, filters.city));
  if (filters.sport) results = results.filter((turf) => (turf.sport_types || []).includes(filters.sport));
  if (filters.minPrice !== undefined) results = results.filter((turf) => Number(turf.base_price_per_hour) >= Number(filters.minPrice));
  if (filters.maxPrice !== undefined) results = results.filter((turf) => Number(turf.base_price_per_hour) <= Number(filters.maxPrice));
  if (filters.minRating !== undefined) results = results.filter((turf) => Number(turf.rating || 0) >= Number(filters.minRating));
  results = results.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100);
  if (!results.length) return results;
  const turfIds = results.map((turf) => turf.id);
  const ownerIds = [...new Set(results.map((turf) => turf.owner_id))];
  const [turfPolicies, ownerPolicies, defaultPolicy] = await Promise.all([
    mongoDb.collection('turf_cancellation_policies').find({ turf_id: { $in: turfIds } }).toArray(),
    mongoDb.collection('owner_cancellation_policies').find({ owner_id: { $in: ownerIds } }).toArray(),
    mongoDb.collection('cancellation_policies').findOne({ is_default: true, is_active: true }),
  ]);
  const turfPolicyByTurf = new Map(turfPolicies.map((item) => [item.turf_id, item.policy_id]));
  const ownerPolicyByOwner = new Map(ownerPolicies.map((item) => [item.owner_id, item.policy_id]));
  const policyIds = [...new Set([...turfPolicyByTurf.values(), ...ownerPolicyByOwner.values(), ...(defaultPolicy ? [defaultPolicy.id] : [])])];
  const [policies, policyTiers] = policyIds.length ? await Promise.all([
    mongoDb.collection('cancellation_policies').find({ id: { $in: policyIds }, is_active: true }).toArray(),
    mongoDb.collection('cancellation_policy_tiers').find({ policy_id: { $in: policyIds } }).sort({ sort_order: 1 }).toArray(),
  ]) : [[], []];
  const policyById = new Map(policies.map((policy) => [policy.id, policy]));
  const tiersByPolicy = new Map();
  for (const tier of policyTiers) tiersByPolicy.set(tier.policy_id, [...(tiersByPolicy.get(tier.policy_id) || []), {
    id: tier.id, minHoursBefore: Number(tier.hours_before_start_min), maxHoursBefore: tier.hours_before_start_max == null ? undefined : Number(tier.hours_before_start_max), refundPercentage: Number(tier.refund_percentage),
  }]);
  return results.map((turf) => {
    const policyId = turfPolicyByTurf.get(turf.id) || ownerPolicyByOwner.get(turf.owner_id) || defaultPolicy?.id;
    const policy = policyById.get(policyId);
    return { ...turf, effective_cancellation_policy: policy ? { id: policy.id, name: policy.name, isDefault: Boolean(policy.is_default), tiers: tiersByPolicy.get(policy.id) || [] } : null };
  });
};

export const getTurf = async (id, { publicOnly = true } = {}) => {
  if (dbProvider === 'postgres') {
    const values = [id];
    const publicFilter = publicOnly ? "AND t.status = 'active' AND t.deleted_at IS NULL AND u.status = 'active' AND op.approval_status = 'active' AND EXISTS (SELECT 1 FROM jsonb_each(COALESCE((t.operating_hours::jsonb)->'days','{}'::jsonb)) AS weekly(weekday, day) WHERE jsonb_typeof(weekly.day->'slots')='array' AND jsonb_array_length(weekly.day->'slots')>0)" : '';
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name, op.billing_model AS owner_billing_model,
        COALESCE((SELECT json_agg(json_build_object('id', tp.id, 'url', tp.url, 'sort_order', tp.sort_order)
          ORDER BY tp.sort_order) FROM turf_photos tp WHERE tp.turf_id = t.id), '[]'::json) AS photos,
        COALESCE((SELECT json_agg(json_build_object('id', pr.id, 'label', pr.label, 'dayOfWeek', pr.day_of_week, 'date', pr.special_date,
          'startTime', pr.start_time, 'endTime', pr.end_time, 'pricePerHour', pr.price_per_hour))
          FROM turf_pricing_rules pr WHERE pr.turf_id = t.id), '[]'::json) AS pricing_rules
       FROM turfs t JOIN users u ON u.id = t.owner_id
       LEFT JOIN turf_owner_profiles op ON op.user_id = t.owner_id
       WHERE t.id = $1 ${publicFilter} LIMIT 1`, values
    );
    return result.rows[0] || null;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id });
  if (!turf || !publicOnly) return turf;
  const [owner, profile] = await Promise.all([
    mongoDb.collection('users').findOne({ id: turf.owner_id, status: 'active' }),
    mongoDb.collection('turf_owner_profiles').findOne({ user_id: turf.owner_id, approval_status: 'active' }),
  ]);
  return turf.status === 'active' && !turf.deleted_at && owner && profile && hasConfiguredWeeklySlots(turf.operating_hours) ? { ...turf, owner_name: owner.name, owner_billing_model: profile.billing_model || 'commission' } : null;
};

const hasConfiguredWeeklySlots = (operatingHours = {}) => {
  const days = operatingHours?.days && typeof operatingHours.days === 'object' ? operatingHours.days : {};
  return Object.values(days).some((day) => Array.isArray(day?.slots) && day.slots.length > 0);
};

export const listOwnerTurfs = async (ownerId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name,
        COALESCE((SELECT json_agg(json_build_object('id', tp.id, 'url', tp.url, 'sort_order', tp.sort_order)
          ORDER BY tp.sort_order) FROM turf_photos tp WHERE tp.turf_id = t.id), '[]'::json) AS photos,
        COALESCE((SELECT json_agg(json_build_object('id', pr.id, 'label', pr.label, 'dayOfWeek', pr.day_of_week, 'date', pr.special_date,
          'startTime', pr.start_time, 'endTime', pr.end_time, 'pricePerHour', pr.price_per_hour))
          FROM turf_pricing_rules pr WHERE pr.turf_id = t.id), '[]'::json) AS pricing_rules
       FROM turfs t JOIN users u ON u.id = t.owner_id WHERE t.owner_id = $1 ORDER BY t.created_at DESC`,
      [ownerId]
    );
    return result.rows;
  }
  return mongoDb.collection('turfs').find({ owner_id: ownerId }).sort({ created_at: -1 }).toArray();
};

export const requestTurfRemoval = async ({ ownerId, turfId, reason }) => {
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const turf = await client.query('SELECT id,status FROM turfs WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE', [turfId, ownerId]);
      if (!turf.rowCount || turf.rows[0].status !== 'active') throw new Error('Only an active turf you own can be submitted for removal.');
      const pending = await client.query("SELECT 1 FROM turf_removal_requests WHERE turf_id=$1 AND status='pending'", [turfId]);
      if (pending.rowCount) throw new Error('A removal request is already pending for this turf.');
      await client.query("INSERT INTO turf_removal_requests (id,turf_id,owner_id,reason) VALUES ($1,$2,$3,$4)", [requestId, turfId, ownerId, reason]);
      await client.query("UPDATE turfs SET status='inactive',updated_at=NOW() WHERE id=$1", [turfId]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value) VALUES ($1,'turf_owner','turf_removal_requested','turf',$2,$3,$4::jsonb,$5::jsonb)", [ownerId, turfId, reason, JSON.stringify({ status: turf.rows[0].status }), JSON.stringify({ status: 'inactive', requestId })]);
      await client.query('COMMIT');
      return { id: requestId, turf_id: turfId, status: 'pending', requested_at: now };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let request;
    await session.withTransaction(async () => {
      const turf = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId, deleted_at: { $exists: false }, status: 'active' }, { session });
      if (!turf) throw new Error('Only an active turf you own can be submitted for removal.');
      if (await mongoDb.collection('turf_removal_requests').findOne({ turf_id: turfId, status: 'pending' }, { session })) throw new Error('A removal request is already pending for this turf.');
      request = { id: requestId, turf_id: turfId, owner_id: ownerId, status: 'pending', reason, requested_at: now };
      await mongoDb.collection('turf_removal_requests').insertOne(request, { session });
      await mongoDb.collection('turfs').updateOne({ id: turfId, owner_id: ownerId, status: 'active' }, { $set: { status: 'inactive', updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'turf_removal_requested', entity_type: 'turf', entity_id: turfId, reason, before_value: { status: turf.status }, after_value: { status: 'inactive', requestId }, created_at: now }, { session });
    });
    return request;
  } finally { await session.endSession(); }
};

export const listPendingTurfRemovalRequests = async () => dbProvider === 'postgres'
  ? (await pool.query(
    `SELECT r.id,r.turf_id,r.owner_id,r.reason,r.requested_at,t.name AS turf_name,u.name AS owner_name
     FROM turf_removal_requests r JOIN turfs t ON t.id=r.turf_id JOIN users u ON u.id=r.owner_id
     WHERE r.status='pending' ORDER BY r.requested_at ASC`
  )).rows
  : await mongoDb.collection('turf_removal_requests').aggregate([
    { $match: { status: 'pending' } },
    { $lookup: { from: 'turfs', localField: 'turf_id', foreignField: 'id', as: 'turf' } },
    { $unwind: '$turf' },
    { $lookup: { from: 'users', localField: 'owner_id', foreignField: 'id', as: 'owner' } },
    { $unwind: '$owner' },
    { $project: { id: 1, turf_id: 1, owner_id: 1, reason: 1, requested_at: 1, turf_name: '$turf.name', owner_name: '$owner.name' } },
    { $sort: { requested_at: 1 } },
  ]).toArray();

export const decideTurfRemovalRequest = async ({ requestId, adminId, decision, reason }) => {
  if (!['approve', 'reject'].includes(decision)) throw new Error('Invalid turf removal decision.');
  if (decision === 'reject' && !String(reason || '').trim()) throw new Error('A reason is required when rejecting a removal request.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM turf_removal_requests WHERE id=$1 AND status=\'pending\' FOR UPDATE', [requestId]);
      const request = result.rows[0];
      if (!request) throw new Error('Pending turf removal request not found.');
      const status = decision === 'approve' ? 'approved' : 'rejected';
      await client.query('UPDATE turf_removal_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_reason=$4 WHERE id=$1', [requestId, status, adminId, reason || null]);
      if (decision === 'approve') await client.query("UPDATE turfs SET status='inactive',deleted_at=NOW(),updated_at=NOW() WHERE id=$1", [request.turf_id]);
      else await client.query("UPDATE turfs SET status='active',updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL", [request.turf_id]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value) VALUES ($1,'admin',$2,'turf',$3,$4,$5::jsonb,$6::jsonb)", [adminId, `turf_removal_${status}`, request.turf_id, reason || null, JSON.stringify({ requestStatus: 'pending' }), JSON.stringify({ requestStatus: status })]);
      await client.query('COMMIT');
      return { ...request, status, reviewed_by: adminId, review_reason: reason || null };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const request = await mongoDb.collection('turf_removal_requests').findOne({ id: requestId, status: 'pending' }, { session });
      if (!request) throw new Error('Pending turf removal request not found.');
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const now = new Date().toISOString();
      await mongoDb.collection('turf_removal_requests').updateOne({ id: requestId, status: 'pending' }, { $set: { status, reviewed_by: adminId, reviewed_at: now, review_reason: reason || null } }, { session });
      await mongoDb.collection('turfs').updateOne(
        { id: request.turf_id },
        decision === 'approve' ? { $set: { status: 'inactive', deleted_at: now, updated_at: now } } : { $set: { status: 'active', updated_at: now }, $unset: { deleted_at: '' } },
        { session }
      );
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: `turf_removal_${status}`, entity_type: 'turf', entity_id: request.turf_id, reason: reason || null, before_value: { requestStatus: 'pending' }, after_value: { requestStatus: status }, created_at: now }, { session });
      updated = { ...request, status, reviewed_by: adminId, reviewed_at: now, review_reason: reason || null };
    });
    return updated;
  } finally { await session.endSession(); }
};

export const createTurf = async (ownerId, input) => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const turf = {
    id, owner_id: ownerId, name: input.name, description: input.description || '',
    address: input.address, area: input.area || '', city: input.city || '',
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    sport_types: input.sportTypes, amenities: input.amenities,
    base_price_per_hour: String(input.basePricePerHour), operating_hours: input.operatingHours,
    status: 'pending_review', rating: 0, review_count: 0, created_at: createdAt,
    photos: input.photos.map((url, index) => ({ id: crypto.randomUUID(), url, sort_order: index })),
    pricing_rules: input.pricingRules,
  };
  if (dbProvider === 'mongodb') {
    await mongoDb.collection('turfs').insertOne(turf);
    return turf;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO turfs (id, owner_id, name, description, address, area, city, latitude, longitude,
        sport_types, amenities, base_price_per_hour, operating_hours, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending_review')`,
      [id, ownerId, turf.name, turf.description, turf.address, turf.area, turf.city, turf.latitude,
        turf.longitude, turf.sport_types, turf.amenities, turf.base_price_per_hour, JSON.stringify(turf.operating_hours)]
    );
    for (const [sortOrder, url] of input.photos.entries()) {
      await client.query('INSERT INTO turf_photos (turf_id, url, sort_order) VALUES ($1,$2,$3)', [id, url, sortOrder]);
    }
    for (const rule of input.pricingRules) {
      await client.query(
        `INSERT INTO turf_pricing_rules (turf_id, day_of_week, special_date, label, start_time, end_time, price_per_hour)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, rule.dayOfWeek ?? null, rule.date ?? null, rule.label, rule.startTime, rule.endTime, rule.pricePerHour]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return turf;
};

const minutesOf = (value) => {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
const configuredPercent = (value, fallback) => {
  const parsed = Number(typeof value === 'object' && value !== null && 'value' in value ? value.value : value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
};
const priceForSlot = (basePrice, rules, date, startTime) => {
  const rule = findPricingRuleForSlot(rules, date, startTime);
  return Number(rule?.price_per_hour ?? rule?.pricePerHour ?? basePrice);
};

const dailySlotTimes = (date, operatingHours = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw new Error('A valid booking date is required.');
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const hours = operatingHours?.days?.[weekday] || operatingHours?.[weekday] || {};
  if (hours.closed === true) return [];
  if (Array.isArray(hours.slots)) {
    return hours.slots.map((slot) => ({ start_time: String(slot.startTime), end_time: String(slot.endTime) }))
      .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));
  }
  return [];
};

const insertDailySlotsPostgres = async (client, turfId, date, operatingHours) => {
  for (const slot of dailySlotTimes(date, operatingHours)) {
    await client.query(
      `INSERT INTO slots (turf_id,date,start_time,end_time,status) VALUES ($1,$2,$3,$4,'available')
       ON CONFLICT (turf_id,date,start_time) DO NOTHING`, [turfId, date, slot.start_time, slot.end_time]
    );
  }
};

const insertDailySlotsMongo = async (turfId, date, operatingHours, session) => {
  const times = dailySlotTimes(date, operatingHours);
  if (!times.length) return;
  try {
    await mongoDb.collection('slots').bulkWrite(times.map((slot) => ({
      updateOne: { filter: { turf_id: turfId, date, start_time: slot.start_time }, update: { $setOnInsert: { id: crypto.randomUUID(), turf_id: turfId, date, ...slot, status: 'available', created_at: new Date().toISOString() } }, upsert: true },
    })), { ordered: false, ...(session ? { session } : {}) });
  } catch (error) {
    if (error.code !== 11000 && !error.writeErrors?.every((writeError) => writeError.code === 11000)) throw error;
  }
};

const clearReleasedBookingSlotLinks = async ({ slotIds, client, session }) => {
  if (!slotIds.length) return;
  if (dbProvider === 'postgres') {
    await client.query(
      `DELETE FROM booking_slots bs USING bookings b
       WHERE bs.booking_id=b.id AND bs.slot_id=ANY($1::uuid[])
         AND b.status IN ('cancelled','expired','refunded','partially_refunded')`,
      [slotIds]
    );
    return;
  }
  const priorLinks = await mongoDb.collection('booking_slots').find({ slot_id: { $in: slotIds } }, { projection: { booking_id: 1 }, session }).toArray();
  const priorBookingIds = [...new Set(priorLinks.map((link) => link.booking_id))];
  if (!priorBookingIds.length) return;
  const releasedBookings = await mongoDb.collection('bookings').find(
    { id: { $in: priorBookingIds }, status: { $in: ['cancelled', 'expired', 'refunded', 'partially_refunded'] } },
    { projection: { id: 1 }, session }
  ).toArray();
  if (releasedBookings.length) await mongoDb.collection('booking_slots').deleteMany(
    { booking_id: { $in: releasedBookings.map((booking) => booking.id) }, slot_id: { $in: slotIds } },
    { session }
  );
};

const validateManualBookingInput = (input) => {
  const duration = Number(input.durationHours);
  const paymentStatus = String(input.paymentStatus || 'pending');
  if (!Number.isInteger(duration) || duration < 1 || duration > 12) throw new Error('Duration must be a whole number of hours from 1 to 12.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime)) throw new Error('A valid date and start time are required.');
  if (!String(input.customerName || '').trim() || !String(input.customerPhone || '').trim()) throw new Error('Customer name and phone are required.');
  if (!['cash', 'bkash', 'nagad', 'rocket', 'bank_transfer'].includes(input.paymentMethod)) throw new Error('Invalid manual payment method.');
  if (!['paid', 'pending', 'partial'].includes(paymentStatus)) throw new Error('Payment status must be paid, pending, or partial.');
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error('A valid Idempotency-Key is required.');
  const paidAmount = input.paymentAmount == null || input.paymentAmount === '' ? null : Number(input.paymentAmount);
  if (paidAmount !== null && (!Number.isFinite(paidAmount) || paidAmount < 0 || Math.round(paidAmount * 100) !== paidAmount * 100)) throw new Error('Payment amount must be a nonnegative amount with up to two decimal places.');
  return { duration, paymentStatus, paidAmount };
};

export const createManualBooking = async (input) => {
  const { duration, paymentStatus, paidAmount } = validateManualBookingInput(input);
  const actorId = input.actorId;
  const source = input.actorRole === 'staff' ? 'manual_staff' : 'manual_owner';
  const idempotencyKey = `manual:${actorId}:${input.idempotencyKey}`;
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT * FROM bookings WHERE idempotency_key=$1', [idempotencyKey]);
      if (prior.rowCount) { await client.query('COMMIT'); return prior.rows[0]; }
      const turfResult = await client.query(
        `SELECT t.*,op.commission_override,op.billing_model FROM turfs t
         JOIN users owner ON owner.id=t.owner_id AND owner.status='active'
         JOIN turf_owner_profiles op ON op.user_id=t.owner_id AND op.approval_status='active'
         WHERE t.id=$1 AND t.status='active' FOR SHARE OF t`, [input.turfId]
      );
      const turf = turfResult.rows[0];
      if (!turf) throw new Error('Turf is unavailable for manual booking.');
      if (input.actorRole === 'turf_owner' && turf.owner_id !== actorId) throw new Error('You can only book a turf that you own.');
      if (input.actorRole === 'staff') {
        const assignment = await client.query("SELECT permissions FROM staff_assignments WHERE staff_user_id=$1 AND turf_id=$2 AND status='active'", [actorId, input.turfId]);
        const permissions = assignment.rows[0]?.permissions || [];
        if (!assignment.rowCount || !Array.isArray(permissions) || !permissions.includes('bookings.create_manual')) throw new Error('Staff permission to create manual bookings is required.');
      }
      await insertDailySlotsPostgres(client, input.turfId, input.date, turf.operating_hours);
      const slotsResult = await client.query(
        `SELECT id,start_time,end_time,status FROM slots WHERE turf_id=$1 AND date=$2 AND start_time >= $3
         ORDER BY start_time LIMIT $4 FOR UPDATE`, [input.turfId, input.date, input.startTime, duration]
      );
      const slots = slotsResult.rows;
      if (slots.length !== duration || slots[0].start_time.slice(0, 5) !== input.startTime) throw new Error('Not enough consecutive availability from the selected start time.');
      await clearReleasedBookingSlotLinks({ client, slotIds: slots.map((slot) => slot.id) });
      for (let index = 0; index < slots.length; index += 1) if (slots[index].status !== 'available' || (index > 0 && minutesOf(slots[index].start_time) !== minutesOf(slots[index - 1].end_time))) throw new Error('Not enough consecutive availability from the selected start time.');
      const [rules, settings] = await Promise.all([
        client.query('SELECT * FROM turf_pricing_rules WHERE turf_id=$1 ORDER BY day_of_week,start_time', [input.turfId]),
        client.query("SELECT key,value FROM platform_settings WHERE key IN ('platform_fee_rate','platform_fee_enabled')"),
      ]);
      const settingValues = Object.fromEntries(settings.rows.map((row) => [row.key, row.value]));
      const baseAmount = roundMoney(slots.reduce((sum, slot) => sum + priceForSlot(turf.base_price_per_hour, rules.rows, input.date, slot.start_time), 0));
      const commissionAmount = 0;
      const platformFeeAmount = turf.billing_model === 'monthly_subscription' || settingValues.platform_fee_enabled === false
        ? 0 : roundMoney(baseAmount * configuredPercent(settingValues.platform_fee_rate, 5) / 100);
      const totalPayable = roundMoney(baseAmount + platformFeeAmount);
      if (paymentStatus === 'paid' && paidAmount !== null && Math.abs(paidAmount - totalPayable) > 0.01) throw new Error('A paid manual booking amount must equal the total due.');
      if (paymentStatus === 'partial' && (paidAmount === null || paidAmount <= 0 || paidAmount >= totalPayable)) throw new Error('A partial payment must be greater than zero and less than the total due.');
      if (paymentStatus === 'pending' && paidAmount !== null && paidAmount !== 0) throw new Error('Pending manual payments cannot include a received amount.');
      const bookingNumber = `TS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const inserted = await client.query(
        `INSERT INTO bookings (booking_number,idempotency_key,player_id,turf_id,booking_date,start_time,end_time,total_hours,booking_source,status,base_amount,commission_amount,platform_fee_amount,has_gateway_fee,gateway_fee_amount,net_owner_amount,total_payable,payment_status)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,FALSE,0,$12,$13,$14) RETURNING *`,
        [bookingNumber, idempotencyKey, input.turfId, input.date, slots[0].start_time, slots[slots.length - 1].end_time, duration, source, baseAmount, commissionAmount, platformFeeAmount, baseAmount, totalPayable, paymentStatus]
      );
      const booking = inserted.rows[0];
      await client.query(
        `INSERT INTO manual_bookings (booking_id,customer_name,customer_phone,customer_email,payment_method,payment_status,payment_reference,payment_amount,created_by,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [booking.id, String(input.customerName).trim(), String(input.customerPhone).trim(), input.customerEmail || null, input.paymentMethod, paymentStatus, input.paymentReference || null, paidAmount ?? (paymentStatus === 'paid' ? totalPayable : 0), actorId, input.notes || null]
      );
      for (const slot of slots) await client.query('INSERT INTO booking_slots (booking_id,slot_id) VALUES ($1,$2)', [booking.id, slot.id]);
      await client.query("UPDATE slots SET status='booked',locked_until=NULL,locked_by_user_id=NULL,updated_at=NOW() WHERE id=ANY($1::uuid[])", [slots.map((slot) => slot.id)]);
      await client.query('INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,$2,\'manual_booking_created\',\'booking\',$3,$4::jsonb)', [actorId, input.actorRole, booking.id, JSON.stringify({ bookingSource: source, paymentStatus, totalPayable })]);
      await client.query('COMMIT');
      return booking;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let booking;
    await session.withTransaction(async () => {
      const existing = await mongoDb.collection('bookings').findOne({ idempotency_key: idempotencyKey }, { session });
      if (existing) { booking = existing; return; }
      const turf = await mongoDb.collection('turfs').findOne({ id: input.turfId, status: 'active' }, { session });
      const owner = turf && await mongoDb.collection('users').findOne({ id: turf.owner_id, status: 'active' }, { session });
      const profile = turf && await mongoDb.collection('turf_owner_profiles').findOne({ user_id: turf.owner_id, approval_status: 'active' }, { session });
      if (!turf || !owner || !profile) throw new Error('Turf is unavailable for manual booking.');
      if (input.actorRole === 'turf_owner' && turf.owner_id !== actorId) throw new Error('You can only book a turf that you own.');
      if (input.actorRole === 'staff') {
        const assignment = await mongoDb.collection('staff_assignments').findOne({ staff_user_id: actorId, turf_id: input.turfId, status: 'active' }, { session });
        if (!assignment || !Array.isArray(assignment.permissions) || !assignment.permissions.includes('bookings.create_manual')) throw new Error('Staff permission to create manual bookings is required.');
      }
      await insertDailySlotsMongo(input.turfId, input.date, turf.operating_hours, session);
      const slots = await mongoDb.collection('slots').find({ turf_id: input.turfId, date: input.date, start_time: { $gte: input.startTime } }, { session }).sort({ start_time: 1 }).limit(duration).toArray();
      if (slots.length !== duration || String(slots[0].start_time).slice(0, 5) !== input.startTime) throw new Error('Not enough consecutive availability from the selected start time.');
      await clearReleasedBookingSlotLinks({ session, slotIds: slots.map((slot) => slot.id) });
      for (let index = 0; index < slots.length; index += 1) if (slots[index].status !== 'available' || (index > 0 && minutesOf(slots[index].start_time) !== minutesOf(slots[index - 1].end_time))) throw new Error('Not enough consecutive availability from the selected start time.');
      const settingsRows = await mongoDb.collection('platform_settings').find({ key: { $in: ['platform_fee_rate', 'platform_fee_enabled'] } }, { session }).toArray();
      const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
      const baseAmount = roundMoney(slots.reduce((sum, slot) => sum + priceForSlot(turf.base_price_per_hour, turf.pricing_rules || [], input.date, slot.start_time), 0));
      const commissionAmount = 0;
      const platformFeeAmount = profile.billing_model === 'monthly_subscription' || settings.platform_fee_enabled === false
        ? 0 : roundMoney(baseAmount * configuredPercent(settings.platform_fee_rate, 5) / 100);
      const totalPayable = roundMoney(baseAmount + platformFeeAmount);
      if (paymentStatus === 'paid' && paidAmount !== null && Math.abs(paidAmount - totalPayable) > 0.01) throw new Error('A paid manual booking amount must equal the total due.');
      if (paymentStatus === 'partial' && (paidAmount === null || paidAmount <= 0 || paidAmount >= totalPayable)) throw new Error('A partial payment must be greater than zero and less than the total due.');
      if (paymentStatus === 'pending' && paidAmount !== null && paidAmount !== 0) throw new Error('Pending manual payments cannot include a received amount.');
      const now = new Date().toISOString();
      booking = {
        id: crypto.randomUUID(), booking_number: `TS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        idempotency_key: idempotencyKey, player_id: null, turf_id: input.turfId, booking_date: input.date,
        start_time: slots[0].start_time, end_time: slots[slots.length - 1].end_time, total_hours: duration,
        booking_source: source, status: 'confirmed', base_amount: baseAmount, commission_amount: commissionAmount,
        platform_fee_amount: platformFeeAmount, has_gateway_fee: false, gateway_fee_amount: 0,
        net_owner_amount: baseAmount, total_payable: totalPayable,
        payment_status: paymentStatus, created_at: now, updated_at: now,
      };
      await mongoDb.collection('bookings').insertOne(booking, { session });
      await mongoDb.collection('manual_bookings').insertOne({
        id: crypto.randomUUID(), booking_id: booking.id, customer_name: String(input.customerName).trim(),
        customer_phone: String(input.customerPhone).trim(), customer_email: input.customerEmail || null,
        payment_method: input.paymentMethod, payment_status: paymentStatus, payment_reference: input.paymentReference || null,
        payment_amount: paidAmount ?? (paymentStatus === 'paid' ? totalPayable : 0), created_by: actorId, notes: input.notes || null,
        created_at: now, updated_at: now,
      }, { session });
      await mongoDb.collection('booking_slots').insertMany(slots.map((slot) => ({ id: crypto.randomUUID(), booking_id: booking.id, slot_id: slot.id })), { session });
      const changed = await mongoDb.collection('slots').updateMany({ id: { $in: slots.map((slot) => slot.id) }, status: 'available' }, { $set: { status: 'booked', locked_until: null, locked_by_user_id: null, updated_at: now } }, { session });
      if (changed.modifiedCount !== duration) throw new Error('Slots changed while booking. Please try again.');
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: actorId, actor_role: input.actorRole, action: 'manual_booking_created', entity_type: 'booking', entity_id: booking.id, after_value: { bookingSource: source, paymentStatus, totalPayable }, created_at: now }, { session });
    });
    return booking;
  } finally { await session.endSession(); }
};

const allowedStaffPermissions = new Set(['bookings.view', 'bookings.view_player_contact', 'bookings.check_in', 'bookings.complete', 'bookings.cancel', 'bookings.create_manual', 'slots.view', 'slots.block', 'slots.unblock']);

export const createStaffAccountAndAssignments = async ({ ownerId, staff, turfIds, permissions, passwordHash }) => {
  if (!Array.isArray(turfIds) || turfIds.length === 0 || new Set(turfIds).size !== turfIds.length) throw new Error('Assign staff to one or more distinct turfs.');
  if (!Array.isArray(permissions) || permissions.some((permission) => !allowedStaffPermissions.has(permission))) throw new Error('A staff permission is not supported.');
  const email = String(staff.email).trim().toLowerCase();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const owner = await client.query("SELECT 1 FROM users u JOIN turf_owner_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='turf_owner' AND u.status='active' AND p.approval_status='active' FOR SHARE OF u", [ownerId]);
      if (!owner.rowCount) throw new Error('Approved turf owner access is required.');
      const turfs = await client.query('SELECT id FROM turfs WHERE id=ANY($1::uuid[]) AND owner_id=$2', [turfIds, ownerId]);
      if (turfs.rowCount !== turfIds.length) throw new Error('Every assigned turf must belong to this owner.');
      let user = (await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email])).rows[0];
      let created = false;
      if (user && user.role !== 'staff') throw new Error('That email is already registered to a different account role.');
      if (user) {
        const assignedElsewhere = await client.query('SELECT 1 FROM staff_assignments sa JOIN turfs t ON t.id=sa.turf_id WHERE sa.staff_user_id=$1 AND t.owner_id<>$2 LIMIT 1', [user.id, ownerId]);
        if (assignedElsewhere.rowCount) throw new Error('This staff account is already assigned to another turf owner.');
      } else {
        const result = await client.query("INSERT INTO users (name,email,phone,password_hash,role,status) VALUES ($1,$2,$3,$4,'staff','active') RETURNING *", [String(staff.name).trim(), email, String(staff.phone).trim(), passwordHash]);
        user = result.rows[0];
        created = true;
      }
      for (const turfId of turfIds) {
        await client.query(
          `INSERT INTO staff_assignments (staff_user_id,turf_id,permissions,assigned_by,status,invited_at)
           VALUES ($1,$2,$3::jsonb,$4,'active',NOW()) ON CONFLICT (staff_user_id,turf_id)
           DO UPDATE SET permissions=EXCLUDED.permissions,assigned_by=EXCLUDED.assigned_by,status='active',invited_at=NOW()`,
          [user.id, turfId, JSON.stringify(permissions), ownerId]
        );
      }
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,'turf_owner','staff_invited','user',$2,$3::jsonb)", [ownerId, user.id, JSON.stringify({ turfIds, permissions, email })]);
      await client.query('COMMIT');
      return { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, created };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const owner = await mongoDb.collection('users').findOne({ id: ownerId, role: 'turf_owner', status: 'active' }, { session });
      const profile = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'active' }, { session });
      if (!owner || !profile) throw new Error('Approved turf owner access is required.');
      const ownedTurfs = await mongoDb.collection('turfs').find({ id: { $in: turfIds }, owner_id: ownerId }, { session }).toArray();
      if (ownedTurfs.length !== turfIds.length) throw new Error('Every assigned turf must belong to this owner.');
      let user = await mongoDb.collection('users').findOne({ email }, { session });
      let created = false;
      if (user && user.role !== 'staff') throw new Error('That email is already registered to a different account role.');
      if (user) {
        const ownedAssignments = await mongoDb.collection('staff_assignments').find({ staff_user_id: user.id }, { session }).toArray();
        const assignedTurfs = await mongoDb.collection('turfs').find({ id: { $in: ownedAssignments.map((assignment) => assignment.turf_id) }, owner_id: { $ne: ownerId } }, { session }).toArray();
        if (assignedTurfs.length) throw new Error('This staff account is already assigned to another turf owner.');
      } else {
        user = { id: crypto.randomUUID(), name: String(staff.name).trim(), email, phone: String(staff.phone).trim(), password_hash: passwordHash, role: 'staff', status: 'active', token_version: 0, created_at: new Date().toISOString() };
        await mongoDb.collection('users').insertOne(user, { session });
        created = true;
      }
      for (const turfId of turfIds) await mongoDb.collection('staff_assignments').updateOne({ staff_user_id: user.id, turf_id: turfId }, { $set: { permissions, assigned_by: ownerId, status: 'active', invited_at: new Date().toISOString() }, $setOnInsert: { id: crypto.randomUUID(), created_at: new Date().toISOString() } }, { upsert: true, session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'staff_invited', entity_type: 'user', entity_id: user.id, after_value: { turfIds, permissions, email }, created_at: new Date().toISOString() }, { session });
      result = { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, created };
    });
    return result;
  } finally { await session.endSession(); }
};

export const listOwnerStaff = async (ownerId) => {
  if (dbProvider === 'postgres') return (await pool.query(
    `SELECT u.id,u.name,u.email,u.phone,sa.turf_id,sa.permissions,sa.status,sa.invited_at
     FROM staff_assignments sa JOIN turfs t ON t.id=sa.turf_id JOIN users u ON u.id=sa.staff_user_id
     WHERE t.owner_id=$1 ORDER BY u.name,t.name`, [ownerId]
  )).rows;
  const ownedTurfs = await mongoDb.collection('turfs').find({ owner_id: ownerId }, { projection: { id: 1, name: 1 } }).toArray();
  const assignments = await mongoDb.collection('staff_assignments').find({ turf_id: { $in: ownedTurfs.map((turf) => turf.id) } }).toArray();
  const users = await mongoDb.collection('users').find({ id: { $in: assignments.map((item) => item.staff_user_id) }, role: 'staff' }).toArray();
  const usersById = new Map(users.map((user) => [user.id, user]));
  return assignments.map((assignment) => ({ id: usersById.get(assignment.staff_user_id)?.id, name: usersById.get(assignment.staff_user_id)?.name, email: usersById.get(assignment.staff_user_id)?.email, phone: usersById.get(assignment.staff_user_id)?.phone, turf_id: assignment.turf_id, permissions: assignment.permissions || [], status: assignment.status, invited_at: assignment.invited_at }));
};

export const listStaffAssignmentsForUser = async (staffId) => {
  const rows = dbProvider === 'postgres'
    ? (await pool.query(`SELECT sa.turf_id,sa.permissions,sa.status,sa.invited_at,t.owner_id,u.name,u.email,u.phone
        FROM staff_assignments sa JOIN turfs t ON t.id=sa.turf_id JOIN users u ON u.id=t.owner_id
        WHERE sa.staff_user_id=$1 AND sa.status='active' ORDER BY t.name`, [staffId])).rows
    : await (async () => {
        const assignments = await mongoDb.collection('staff_assignments').find({ staff_user_id: staffId, status: 'active' }).toArray();
        const turfIds = assignments.map((item) => item.turf_id);
        const turfs = await mongoDb.collection('turfs').find({ id: { $in: turfIds } }).toArray();
        const owners = await mongoDb.collection('users').find({ id: { $in: turfs.map((turf) => turf.owner_id) } }).toArray();
        const turfById = new Map(turfs.map((turf) => [turf.id, turf]));
        const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
        return assignments.map((assignment) => ({ ...assignment, owner_id: turfById.get(assignment.turf_id)?.owner_id, name: ownerById.get(turfById.get(assignment.turf_id)?.owner_id)?.name, email: ownerById.get(turfById.get(assignment.turf_id)?.owner_id)?.email, phone: ownerById.get(turfById.get(assignment.turf_id)?.owner_id)?.phone }));
      })();
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.owner_id)) grouped.set(row.owner_id, { id: row.owner_id, ownerId: row.owner_id, staffUserId: staffId, staffName: '', staffEmail: '', staffPhone: '', ownerName: row.name, ownerEmail: row.email, turfIds: [], permissions: [], status: 'active', invitedAt: row.invited_at });
    const assignment = grouped.get(row.owner_id);
    assignment.turfIds.push(row.turf_id);
    assignment.permissions = [...new Set([...assignment.permissions, ...(row.permissions || [])])];
  }
  return [...grouped.values()];
};

export const revokeOwnerStaffAccess = async ({ ownerId, staffId, turfId }) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `DELETE FROM staff_assignments sa USING turfs t WHERE sa.turf_id=t.id AND t.owner_id=$1 AND sa.staff_user_id=$2
       AND ($3::uuid IS NULL OR sa.turf_id=$3) RETURNING sa.turf_id`, [ownerId, staffId, turfId || null]
    );
    if (result.rowCount) await pool.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,'turf_owner','staff_access_revoked','user',$2,$3::jsonb)", [ownerId, staffId, JSON.stringify({ turfIds: result.rows.map((row) => row.turf_id) })]);
    return result.rows.map((row) => row.turf_id);
  }
  const ownedTurfs = await mongoDb.collection('turfs').find({ owner_id: ownerId, ...(turfId ? { id: turfId } : {}) }, { projection: { id: 1 } }).toArray();
  const ids = ownedTurfs.map((turf) => turf.id);
  const removed = await mongoDb.collection('staff_assignments').deleteMany({ staff_user_id: staffId, turf_id: { $in: ids } });
  if (removed.deletedCount) await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'staff_access_revoked', entity_type: 'user', entity_id: staffId, after_value: { turfIds: ids }, created_at: new Date().toISOString() });
  return ids;
};

export const deleteUnassignedStaffUser = async (staffId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `DELETE FROM users u WHERE u.id=$1 AND u.role='staff'
       AND NOT EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.staff_user_id=u.id) RETURNING id`, [staffId]
    );
    return result.rowCount > 0;
  }
  const assignments = await mongoDb.collection('staff_assignments').countDocuments({ staff_user_id: staffId });
  if (assignments) return false;
  const result = await mongoDb.collection('users').deleteOne({ id: staffId, role: 'staff' });
  return result.deletedCount > 0;
};

export const createBookingHold = async ({ playerId, turfId, date, startTime, durationHours, idempotencyKey, holdMinutes = 10 }) => {
  const duration = Number(durationHours);
  if (!Number.isInteger(duration) || duration < 1 || duration > 12) throw new Error('Duration must be a whole number of hours from 1 to 12.');
  const lockDuration = Number(holdMinutes);
  if (!Number.isInteger(lockDuration) || lockDuration < 1 || lockDuration > 60) throw new Error('Booking hold duration must be from 1 to 60 minutes.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !idempotencyKey) throw new Error('A valid date, start time, and Idempotency-Key are required.');

  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT * FROM bookings WHERE player_id=$1 AND idempotency_key=$2', [playerId, idempotencyKey]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        return existing.rows[0];
      }
      const turfResult = await client.query(
        `SELECT t.*, op.commission_override, op.billing_model FROM turfs t
         JOIN turf_owner_profiles op ON op.user_id=t.owner_id
         JOIN users u ON u.id=t.owner_id
         WHERE t.id=$1 AND t.status='active' AND op.approval_status='active' AND u.status='active'
         FOR SHARE OF t`, [turfId]
      );
      const turf = turfResult.rows[0];
      if (!turf) throw new Error('Turf is unavailable for booking.');
      await insertDailySlotsPostgres(client, turfId, date, turf.operating_hours);
      // A confirmed or checked-in booking is authoritative even if a slot row
      // was accidentally reset to available by an older code path.
      await client.query(
        `UPDATE slots s SET status='booked', locked_until=NULL, locked_by_user_id=NULL, updated_at=NOW()
         WHERE s.turf_id=$1 AND s.date=$2 AND s.status='available'
           AND EXISTS (SELECT 1 FROM booking_slots bs JOIN bookings b ON b.id=bs.booking_id
                       WHERE bs.slot_id=s.id AND b.status IN ('confirmed','checked_in','completed'))`, [turfId, date]
      );
      const slotsResult = await client.query(
        `SELECT id, start_time, end_time, status FROM slots
         WHERE turf_id=$1 AND date=$2 AND start_time >= $3
         ORDER BY start_time LIMIT $4 FOR UPDATE`, [turfId, date, startTime, duration]
      );
      const slots = slotsResult.rows;
      if (slots.length !== duration || slots[0].start_time.slice(0, 5) !== startTime) throw new Error('Not enough consecutive availability from the selected start time.');
      await clearReleasedBookingSlotLinks({ client, slotIds: slots.map((slot) => slot.id) });
      const activeConflict = await client.query(
        `SELECT 1 FROM bookings WHERE turf_id=$1 AND booking_date=$2
         AND status IN ('confirmed','checked_in','completed') AND start_time < $4 AND end_time > $3 LIMIT 1`,
        [turfId, date, slots[0].start_time, slots[slots.length - 1].end_time]
      );
      if (activeConflict.rowCount) throw new Error('This time slot is already booked. Please select another available time.');
      for (let index = 0; index < slots.length; index += 1) {
        if (slots[index].status !== 'available' || (index > 0 && minutesOf(slots[index].start_time) !== minutesOf(slots[index - 1].end_time))) {
          throw new Error('Not enough consecutive availability from the selected start time.');
        }
      }
      const rules = await client.query('SELECT * FROM turf_pricing_rules WHERE turf_id=$1 ORDER BY day_of_week, start_time', [turfId]);
      const settings = await client.query("SELECT key, value FROM platform_settings WHERE key IN ('platform_fee_rate','gateway_fee_rate','platform_fee_enabled','gateway_fee_enabled','booking_hold_minutes')");
      const settingValues = Object.fromEntries(settings.rows.map((row) => [row.key, row.value]));
      const bookingHoldMinutes = Number(settingValues.booking_hold_minutes ?? lockDuration);
      const baseAmount = roundMoney(slots.reduce((sum, slot) => sum + priceForSlot(turf.base_price_per_hour, rules.rows, date, slot.start_time), 0));
      const platformRate = turf.billing_model === 'monthly_subscription' || settingValues.platform_fee_enabled === false
        ? 0 : configuredPercent(settingValues.platform_fee_rate, 5);
      const gatewayRate = settingValues.gateway_fee_enabled === false ? 0 : configuredPercent(settingValues.gateway_fee_rate, 2.5);
      const amounts = calculateBookingAmounts({ baseAmount, platformRate, gatewayRate });
      const bookingNumber = `TS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const bookingResult = await client.query(
        `INSERT INTO bookings (booking_number,idempotency_key,player_id,turf_id,booking_date,start_time,end_time,total_hours,
          booking_source,status,base_amount,commission_amount,platform_fee_amount,gateway_fee_amount,net_owner_amount,total_payable,payment_status,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'online','pending_payment',$9,$10,$11,$12,$13,$14,'pending',NOW()+($15 * INTERVAL '1 minute')) RETURNING *`,
        [bookingNumber, idempotencyKey, playerId, turfId, date, slots[0].start_time, slots[slots.length - 1].end_time,
         duration, baseAmount, amounts.commissionAmount, amounts.platformFeeAmount, amounts.gatewayFeeAmount, amounts.netOwnerAmount, amounts.totalPayable, bookingHoldMinutes]
      );
      const booking = bookingResult.rows[0];
      await client.query(
        `INSERT INTO payments (booking_id,gateway,transaction_id,amount,status,currency,idempotency_key)
         VALUES ($1,'sslcommerz',$2,$3,'initiated','BDT',$2)`, [booking.id, bookingNumber, amounts.totalPayable]
      );
      for (const slot of slots) await client.query('INSERT INTO booking_slots (booking_id,slot_id) VALUES ($1,$2)', [booking.id, slot.id]);
      await client.query(
        `UPDATE slots SET status='locked', locked_until=(SELECT expires_at FROM bookings WHERE id=$2), locked_by_user_id=$3, updated_at=NOW()
         WHERE id=ANY($1::uuid[])`, [slots.map((slot) => slot.id), booking.id, playerId]
      );
      await client.query('COMMIT');
      return booking;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const session = mongoClient.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const bookings = mongoDb.collection('bookings');
      const existing = await bookings.findOne({ player_id: playerId, idempotency_key: idempotencyKey }, { session });
      if (existing) { created = existing; return; }
      const turf = await mongoDb.collection('turfs').findOne({ id: turfId, status: 'active' }, { session });
      const profile = turf && await mongoDb.collection('turf_owner_profiles').findOne({ user_id: turf.owner_id, approval_status: 'active' }, { session });
      const owner = turf && await mongoDb.collection('users').findOne({ id: turf.owner_id, status: 'active' }, { session });
      if (!turf || !profile || !owner) throw new Error('Turf is unavailable for booking.');
      await insertDailySlotsMongo(turfId, date, turf.operating_hours, session);
      const now = new Date();
      // Repair availability from authoritative booking records before checking
      // a new request, so checked-in bookings can never be double-booked.
      const dateSlots = await mongoDb.collection('slots').find({ turf_id: turfId, date, status: 'available' }, { projection: { id: 1 }, session }).toArray();
      const dateSlotIds = dateSlots.map((slot) => slot.id);
      if (dateSlotIds.length) {
        const linkedBookings = await mongoDb.collection('booking_slots').find({ slot_id: { $in: dateSlotIds } }, { projection: { slot_id: 1, booking_id: 1 }, session }).toArray();
        const activeBookingIds = [...new Set(linkedBookings.map((item) => item.booking_id))];
        const activeBookings = activeBookingIds.length ? await mongoDb.collection('bookings').find({ id: { $in: activeBookingIds }, status: { $in: ['confirmed', 'checked_in', 'completed'] } }, { projection: { id: 1 }, session }).toArray() : [];
        const activeIds = new Set(activeBookings.map((booking) => booking.id));
        const reservedSlotIds = linkedBookings.filter((item) => activeIds.has(item.booking_id)).map((item) => item.slot_id);
        if (reservedSlotIds.length) await mongoDb.collection('slots').updateMany({ id: { $in: reservedSlotIds }, status: 'available' }, { $set: { status: 'booked', locked_until: null, locked_by_user_id: null, updated_at: now.toISOString() } }, { session });
      }
      const slots = await mongoDb.collection('slots').find({ turf_id: turfId, date, start_time: { $gte: startTime } }, { session }).sort({ start_time: 1 }).limit(duration).toArray();
      if (slots.length !== duration || String(slots[0].start_time).slice(0, 5) !== startTime) throw new Error('Not enough consecutive availability from the selected start time.');
      await clearReleasedBookingSlotLinks({ session, slotIds: slots.map((slot) => slot.id) });
      const activeConflict = await mongoDb.collection('bookings').findOne({
        turf_id: turfId, booking_date: date, status: { $in: ['confirmed', 'checked_in', 'completed'] },
        start_time: { $lt: slots[slots.length - 1].end_time }, end_time: { $gt: slots[0].start_time },
      }, { session, projection: { id: 1 } });
      if (activeConflict) throw new Error('This time slot is already booked. Please select another available time.');
      for (let index = 0; index < slots.length; index += 1) {
        if (slots[index].status !== 'available' || (index > 0 && minutesOf(slots[index].start_time) !== minutesOf(slots[index - 1].end_time))) {
          throw new Error('Not enough consecutive availability from the selected start time.');
        }
      }
      const settingsDocs = await mongoDb.collection('platform_settings').find({ key: { $in: ['platform_fee_rate','gateway_fee_rate','platform_fee_enabled','gateway_fee_enabled','booking_hold_minutes'] } }, { session }).toArray();
      const settings = Object.fromEntries(settingsDocs.map((row) => [row.key, row.value]));
      const bookingHoldMinutes = Number(settings.booking_hold_minutes ?? lockDuration);
      const baseAmount = roundMoney(slots.reduce((sum, slot) => sum + priceForSlot(turf.base_price_per_hour, turf.pricing_rules || [], date, slot.start_time), 0));
      const platformRate = turf.billing_model === 'monthly_subscription' || settings.platform_fee_enabled === false
        ? 0 : configuredPercent(settings.platform_fee_rate, 5);
      const gatewayRate = settings.gateway_fee_enabled === false ? 0 : configuredPercent(settings.gateway_fee_rate, 2.5);
      const amounts = calculateBookingAmounts({ baseAmount, platformRate, gatewayRate });
      const bookingNumber = `TS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const booking = {
        id: crypto.randomUUID(), booking_number: bookingNumber, idempotency_key: idempotencyKey,
        player_id: playerId, turf_id: turfId, booking_date: date,
        start_time: slots[0].start_time, end_time: slots[slots.length - 1].end_time,
        total_hours: duration, booking_source: 'online', status: 'pending_payment',
        base_amount: baseAmount.toFixed(2), commission_amount: amounts.commissionAmount.toFixed(2),
        platform_fee_amount: amounts.platformFeeAmount.toFixed(2), gateway_fee_amount: amounts.gatewayFeeAmount.toFixed(2),
        net_owner_amount: amounts.netOwnerAmount.toFixed(2),
        total_payable: amounts.totalPayable.toFixed(2),
        payment_status: 'pending', expires_at: new Date(now.getTime() + bookingHoldMinutes * 60 * 1000).toISOString(), created_at: now.toISOString(),
      };
      await bookings.insertOne(booking, { session });
      await mongoDb.collection('payments').insertOne({
        id: crypto.randomUUID(), booking_id: booking.id, gateway: 'sslcommerz',
        transaction_id: bookingNumber, amount: booking.total_payable, status: 'initiated',
        currency: 'BDT', idempotency_key: bookingNumber, created_at: now.toISOString(),
      }, { session });
      await mongoDb.collection('booking_slots').insertMany(slots.map((slot) => ({ id: crypto.randomUUID(), booking_id: booking.id, slot_id: slot.id })), { session });
      const updated = await mongoDb.collection('slots').updateMany({ id: { $in: slots.map((slot) => slot.id) }, status: 'available' }, {
        $set: { status: 'locked', locked_until: booking.expires_at, locked_by_user_id: playerId },
      }, { session });
      if (updated.modifiedCount !== duration) throw new Error('Slots changed while booking. Please try again.');
      created = booking;
    });
    return created;
  } finally {
    await session.endSession();
  }
};

export const getBookingForPayment = async (bookingId, playerId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT b.*, p.transaction_id, p.gateway AS payment_gateway, p.gateway_response, p.amount AS expected_amount, p.currency AS expected_currency
       FROM bookings b JOIN payments p ON p.booking_id=b.id
       WHERE b.id=$1 AND b.player_id=$2 LIMIT 1`, [bookingId, playerId]
    );
    return result.rows[0] || null;
  }
  const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, player_id: playerId });
  if (!booking) return null;
  const payment = await mongoDb.collection('payments').findOne({ booking_id: bookingId });
  return payment ? { ...booking, transaction_id: payment.transaction_id, payment_gateway: payment.gateway, gateway_response: payment.gateway_response, expected_amount: payment.amount, expected_currency: payment.currency } : null;
};

export const claimPaymentGatewayForCheckout = async (transactionId, gateway) => {
  if (!['sslcommerz', 'surjopay', 'uddoktapay'].includes(gateway)) throw new Error('Unsupported payment gateway.');
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `UPDATE payments SET gateway=$2,gateway_response=COALESCE(gateway_response,'{}'::jsonb) || '{"checkout_claimed":true}'::jsonb
       WHERE transaction_id=$1 AND status='initiated' AND (
         (gateway=$2 AND gateway_response->>'checkout_claimed' IS NULL) OR
         (gateway='sslcommerz' AND (gateway_response IS NULL OR gateway_response='{}'::jsonb))
       ) RETURNING id`, [transactionId, gateway]
    );
    return result.rowCount === 1;
  }
  const result = await mongoDb.collection('payments').findOneAndUpdate({
    transaction_id: transactionId,
    status: 'initiated',
    $or: [
      { gateway, 'gateway_response.checkout_claimed': { $exists: false } },
      { gateway: 'sslcommerz', $or: [{ gateway_response: null }, { gateway_response: { $exists: false } }, { gateway_response: {} }] },
    ],
  }, { $set: { gateway, 'gateway_response.checkout_claimed': true } }, { returnDocument: 'after' });
  return Boolean(result);
};

export const savePaymentSession = async (transactionId, sessionData, gateway = 'sslcommerz') => {
  if (dbProvider === 'postgres') {
    await pool.query(
      `UPDATE payments SET gateway_response=COALESCE(gateway_response,'{}'::jsonb) || $2::jsonb
       WHERE transaction_id=$1 AND status='initiated' AND gateway=$3`, [transactionId, JSON.stringify(sessionData), gateway]
    );
    return;
  }
  const sessionUpdates = Object.fromEntries(Object.entries(sessionData || {}).map(([key, value]) => [`gateway_response.${key}`, value]));
  await mongoDb.collection('payments').updateOne({ transaction_id: transactionId, status: 'initiated', gateway }, { $set: sessionUpdates });
};

export const getPaymentForGatewayCallback = async ({ gateway, providerReference, transactionId }) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT b.*,p.transaction_id,p.gateway AS payment_gateway,p.amount AS expected_amount,p.currency AS expected_currency,p.gateway_response
       FROM payments p JOIN bookings b ON b.id=p.booking_id
       WHERE p.gateway=$1 AND (p.gateway_response->>'provider_reference'=$2 OR ($3::text IS NOT NULL AND p.transaction_id=$3 AND p.gateway_response->>'checkout_claimed'='true')) LIMIT 1`, [gateway, providerReference, transactionId || null]
    );
    return result.rows[0] || null;
  }
  const clauses = [{ 'gateway_response.provider_reference': providerReference }];
  if (transactionId) clauses.push({ transaction_id: transactionId, 'gateway_response.checkout_claimed': true });
  const payment = await mongoDb.collection('payments').findOne({ gateway, $or: clauses });
  if (!payment) return null;
  const booking = await mongoDb.collection('bookings').findOne({ id: payment.booking_id });
  return booking ? { ...booking, transaction_id: payment.transaction_id, payment_gateway: payment.gateway, expected_amount: payment.amount, expected_currency: payment.currency, gateway_response: payment.gateway_response } : null;
};

export const confirmBookingPayment = async ({ transactionId, amount, currency, validationId, gatewayResponse, gateway = 'sslcommerz' }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT b.*, p.id AS payment_id, p.amount AS expected_amount, p.status AS payment_status, p.currency AS expected_currency, p.gateway AS payment_gateway
         FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.transaction_id=$1 AND p.gateway=$2 FOR UPDATE OF p,b`, [transactionId, gateway]
      );
      const booking = result.rows[0];
      if (!booking) throw new Error('Payment transaction is not recognized.');
      if (Math.abs(Number(booking.expected_amount) - Number(amount)) > 0.01 || booking.expected_currency !== currency) throw new Error('Validated payment amount or currency does not match the booking.');
      if (booking.payment_status === 'paid' && booking.status === 'confirmed') {
        await client.query('COMMIT');
        return booking;
      }
      if ((booking.status === 'expired' && booking.payment_status === 'expired') || (booking.status === 'pending_payment' && new Date(booking.expires_at).getTime() <= Date.now())) {
        const refundable = roundMoney(Math.max(0, Number(booking.expected_amount) - Number(booking.gateway_fee_amount || 0)));
        await client.query("UPDATE payments SET status='paid_late',validation_id=$2,gateway_response=COALESCE(gateway_response,'{}'::jsonb) || $3::jsonb WHERE id=$1", [booking.payment_id, validationId, JSON.stringify(gatewayResponse)]);
        await client.query("UPDATE bookings SET status='expired',payment_status='refund_pending',updated_at=NOW() WHERE id=$1", [booking.id]);
        await client.query(
          `UPDATE slots SET status='available',locked_until=NULL,locked_by_user_id=NULL,updated_at=NOW()
           WHERE status='locked' AND id IN (SELECT slot_id FROM booking_slots WHERE booking_id=$1)`, [booking.id]
        );
        if (refundable > 0) await client.query(
          `INSERT INTO refunds (booking_id,amount,turf_price_refunded,platform_fee_refunded,gateway_fee_refunded,booking_source,reason,initiated_by,status)
           VALUES ($1,$2,$3,$4,$5,'online','Payment arrived after the booking hold expired','system','pending')`,
          [booking.id, refundable, booking.base_amount, booking.platform_fee_amount, 0]
        );
        await client.query('COMMIT');
        return { ...booking, status: 'expired_refund_pending', payment_status: 'refund_pending' };
      }
      if (booking.status !== 'pending_payment' || booking.payment_status !== 'initiated') throw new Error('Booking is not awaiting payment.');
      await client.query(
        `UPDATE payments SET status='paid', validation_id=$2, gateway_response=COALESCE(gateway_response,'{}'::jsonb) || $3::jsonb WHERE id=$1`,
        [booking.payment_id, validationId, JSON.stringify(gatewayResponse)]
      );
      await client.query("UPDATE bookings SET status='confirmed', payment_status='paid', updated_at=NOW() WHERE id=$1", [booking.id]);
      await client.query(
        `UPDATE slots SET status='booked', locked_until=NULL, locked_by_user_id=NULL, updated_at=NOW()
         WHERE id IN (SELECT slot_id FROM booking_slots WHERE booking_id=$1)`, [booking.id]
      );
      const owner = await client.query('SELECT owner_id FROM turfs WHERE id=$1', [booking.turf_id]);
      const ownerId = owner.rows[0].owner_id;
      await client.query(
        `INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description)
         VALUES ($1,$2,'booking_credit',$3,$4,'Net owner booking earning') ON CONFLICT (idempotency_key) DO NOTHING`,
        [ownerId, booking.id, booking.net_owner_amount, `booking-credit:${booking.id}`]
      );
      await client.query(
        `INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description)
         VALUES ($1,$2,'hold',$3,$4,'Held through the cancellation window') ON CONFLICT (idempotency_key) DO NOTHING`,
        [ownerId, booking.id, booking.net_owner_amount, `booking-hold:${booking.id}`]
      );
      await client.query(
        `INSERT INTO wallets (owner_id,available_balance,held_balance) VALUES ($1,0,$2)
         ON CONFLICT (owner_id) DO UPDATE SET held_balance=wallets.held_balance+EXCLUDED.held_balance,updated_at=NOW()`,
        [ownerId, booking.net_owner_amount]
      );
      await client.query('COMMIT');
      return { ...booking, status: 'confirmed', payment_status: 'paid' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const session = mongoClient.startSession();
  try {
    let confirmed;
    await session.withTransaction(async () => {
      const payment = await mongoDb.collection('payments').findOne({ transaction_id: transactionId, gateway }, { session });
      if (!payment) throw new Error('Payment transaction is not recognized.');
      if (Math.abs(Number(payment.amount) - Number(amount)) > 0.01 || payment.currency !== currency) throw new Error('Validated payment amount or currency does not match the booking.');
      const booking = await mongoDb.collection('bookings').findOne({ id: payment.booking_id }, { session });
      if (!booking) throw new Error('Booking was not found.');
      booking.payment_gateway = payment.gateway;
      if (payment.status === 'paid' && booking.status === 'confirmed') { confirmed = booking; return; }
      if ((booking.status === 'expired' && payment.status === 'expired') || (booking.status === 'pending_payment' && new Date(booking.expires_at).getTime() <= Date.now())) {
        const refundable = roundMoney(Math.max(0, Number(payment.amount) - Number(booking.gateway_fee_amount || 0)));
        const now = new Date().toISOString();
        await mongoDb.collection('payments').updateOne({ id: payment.id, status: 'expired' }, { $set: { status: 'paid_late', validation_id: validationId, gateway_response: { ...(payment.gateway_response || {}), ...gatewayResponse } } }, { session });
        await mongoDb.collection('bookings').updateOne({ id: booking.id }, { $set: { status: 'expired', payment_status: 'refund_pending', updated_at: now } }, { session });
        const linked = await mongoDb.collection('booking_slots').find({ booking_id: booking.id }, { session }).toArray();
        await mongoDb.collection('slots').updateMany({ id: { $in: linked.map((item) => item.slot_id) }, status: 'locked' }, { $set: { status: 'available', locked_until: null, locked_by_user_id: null } }, { session });
        if (refundable > 0) await mongoDb.collection('refunds').insertOne({ id: crypto.randomUUID(), booking_id: booking.id, amount: refundable, turf_price_refunded: Number(booking.base_amount), platform_fee_refunded: Number(booking.platform_fee_amount), gateway_fee_refunded: 0, booking_source: 'online', reason: 'Payment arrived after the booking hold expired', initiated_by: 'system', status: 'pending', created_at: now }, { session });
        confirmed = { ...booking, status: 'expired_refund_pending', payment_status: 'refund_pending' };
        return;
      }
      if (booking.status !== 'pending_payment' || payment.status !== 'initiated') throw new Error('Booking is not awaiting payment.');
      await mongoDb.collection('payments').updateOne({ id: payment.id, status: 'initiated' }, { $set: { status: 'paid', validation_id: validationId, gateway_response: { ...(payment.gateway_response || {}), ...gatewayResponse } } }, { session });
      await mongoDb.collection('bookings').updateOne({ id: booking.id, status: 'pending_payment' }, { $set: { status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() } }, { session });
      const linked = await mongoDb.collection('booking_slots').find({ booking_id: booking.id }, { session }).toArray();
      await mongoDb.collection('slots').updateMany({ id: { $in: linked.map((item) => item.slot_id) }, status: 'locked' }, { $set: { status: 'booked', locked_until: null, locked_by_user_id: null } }, { session });
      const turf = await mongoDb.collection('turfs').findOne({ id: booking.turf_id }, { session });
      const netAmount = Number(booking.net_owner_amount);
      await mongoDb.collection('wallet_transactions').insertMany([
        { id: crypto.randomUUID(), owner_id: turf.owner_id, booking_id: booking.id, transaction_type: 'booking_credit', amount: netAmount, idempotency_key: `booking-credit:${booking.id}`, description: 'Net owner booking earning', created_at: new Date().toISOString() },
        { id: crypto.randomUUID(), owner_id: turf.owner_id, booking_id: booking.id, transaction_type: 'hold', amount: netAmount, idempotency_key: `booking-hold:${booking.id}`, description: 'Held through the cancellation window', created_at: new Date().toISOString() },
      ], { session });
      await mongoDb.collection('wallets').updateOne(
        { owner_id: turf.owner_id },
        { $setOnInsert: { id: crypto.randomUUID(), owner_id: turf.owner_id, available_balance: 0 }, $inc: { held_balance: netAmount }, $set: { updated_at: new Date().toISOString() } },
        { upsert: true, session }
      );
      confirmed = { ...booking, status: 'confirmed', payment_status: 'paid' };
    });
    return confirmed;
  } finally {
    await session.endSession();
  }
};

// A player may release an unpaid hold before its configured expiry. Keep the
// booking in the existing expired state so late gateway callbacks follow the
// same refund-safe path as any other expired hold.
export const releasePendingBookingHold = async ({ bookingId, playerId }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const booking = await client.query(
        `SELECT id FROM bookings WHERE id=$1 AND player_id=$2 AND booking_source='online' AND status='pending_payment' FOR UPDATE`,
        [bookingId, playerId]
      );
      if (!booking.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query("UPDATE bookings SET status='expired',payment_status='expired',updated_at=NOW() WHERE id=$1", [bookingId]);
      await client.query("UPDATE slots SET status='available',locked_until=NULL,locked_by_user_id=NULL,updated_at=NOW() WHERE id IN (SELECT slot_id FROM booking_slots WHERE booking_id=$1) AND status='locked'", [bookingId]);
      await client.query("UPDATE payments SET status='expired' WHERE booking_id=$1 AND status='initiated'", [bookingId]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let released = false;
    await session.withTransaction(async () => {
      const booking = await mongoDb.collection('bookings').updateOne(
        { id: bookingId, player_id: playerId, booking_source: 'online', status: 'pending_payment' },
        { $set: { status: 'expired', payment_status: 'expired', updated_at: new Date().toISOString() } },
        { session }
      );
      if (!booking.modifiedCount) return;
      released = true;
      const linked = await mongoDb.collection('booking_slots').find({ booking_id: bookingId }, { session }).toArray();
      await mongoDb.collection('slots').updateMany(
        { id: { $in: linked.map((item) => item.slot_id) }, status: 'locked' },
        { $set: { status: 'available', locked_until: null, locked_by_user_id: null, updated_at: new Date().toISOString() } }, { session }
      );
      await mongoDb.collection('payments').updateMany({ booking_id: bookingId, status: 'initiated' }, { $set: { status: 'expired' } }, { session });
    });
    return released;
  } finally { await session.endSession(); }
};

export const expireBookingHold = async (bookingId) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE bookings SET status='expired', payment_status='expired', updated_at=NOW()
         WHERE id=$1 AND status='pending_payment' AND expires_at <= NOW() RETURNING id`, [bookingId]
      );
      if (result.rowCount) {
        await client.query(
          `UPDATE slots SET status='available', locked_until=NULL, locked_by_user_id=NULL, updated_at=NOW()
           WHERE id IN (SELECT slot_id FROM booking_slots WHERE booking_id=$1) AND status='locked'`, [bookingId]
        );
        await client.query("UPDATE payments SET status='expired' WHERE booking_id=$1 AND status='initiated'", [bookingId]);
      }
      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let expired = false;
    await session.withTransaction(async () => {
      const now = new Date().toISOString();
      const result = await mongoDb.collection('bookings').updateOne(
        { id: bookingId, status: 'pending_payment', expires_at: { $lte: now } },
        { $set: { status: 'expired', payment_status: 'expired', updated_at: now } }, { session }
      );
      expired = result.modifiedCount > 0;
      if (expired) {
        const linked = await mongoDb.collection('booking_slots').find({ booking_id: bookingId }, { session }).toArray();
        await mongoDb.collection('slots').updateMany(
          { id: { $in: linked.map((item) => item.slot_id) }, status: 'locked' },
          { $set: { status: 'available', locked_until: null, locked_by_user_id: null } }, { session }
        );
        await mongoDb.collection('payments').updateMany({ booking_id: bookingId, status: 'initiated' }, { $set: { status: 'expired' } }, { session });
      }
    });
    return expired;
  } finally { await session.endSession(); }
};

export const expirePendingBookingHolds = async () => {
  if (dbProvider === 'postgres') {
    const expired = await pool.query(
      `UPDATE bookings SET status='expired', payment_status='expired', updated_at=NOW()
       WHERE status='pending_payment' AND expires_at <= NOW() RETURNING id`
    );
    const ids = expired.rows.map((row) => row.id);
    if (ids.length) {
      await pool.query(
        `UPDATE slots SET status='available', locked_until=NULL, locked_by_user_id=NULL, updated_at=NOW()
         WHERE status='locked' AND id IN (SELECT slot_id FROM booking_slots WHERE booking_id=ANY($1::uuid[]))`, [ids]
      );
      await pool.query("UPDATE payments SET status='expired' WHERE booking_id=ANY($1::uuid[]) AND status='initiated'", [ids]);
    }
    return ids.length;
  }
  const session = mongoClient.startSession();
  try {
    let count = 0;
    await session.withTransaction(async () => {
      const now = new Date().toISOString();
      const result = await mongoDb.collection('bookings').updateMany(
        { status: 'pending_payment', expires_at: { $lte: now } },
        { $set: { status: 'expired', payment_status: 'expired', updated_at: now } }, { session }
      );
      count = result.modifiedCount;
      if (count) {
        const expired = await mongoDb.collection('bookings').find({ status: 'expired', expires_at: { $lte: now } }, { projection: { id: 1 }, session }).toArray();
        const ids = expired.map((row) => row.id);
        const linked = await mongoDb.collection('booking_slots').find({ booking_id: { $in: ids } }, { session }).toArray();
        await mongoDb.collection('slots').updateMany({ id: { $in: linked.map((row) => row.slot_id) }, status: 'locked' }, { $set: { status: 'available', locked_until: null, locked_by_user_id: null } }, { session });
        await mongoDb.collection('payments').updateMany({ booking_id: { $in: ids }, status: 'initiated' }, { $set: { status: 'expired' } }, { session });
      }
    });
    return count;
  } finally { await session.endSession(); }
};

export const getOwnerWallet = async (ownerId) => {
  if (dbProvider === 'postgres') {
    const [wallet, transactions, withdrawals, paidOut] = await Promise.all([
      pool.query('SELECT available_balance,held_balance,updated_at FROM wallets WHERE owner_id=$1', [ownerId]),
      pool.query('SELECT * FROM wallet_transactions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100', [ownerId]),
      pool.query('SELECT * FROM withdrawals WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50', [ownerId]),
      pool.query("SELECT COALESCE(SUM(amount),0) AS total_withdrawn FROM withdrawals WHERE owner_id=$1 AND status IN ('paid','completed')", [ownerId]),
    ]);
    return { wallet: { ...(wallet.rows[0] || { available_balance: 0, held_balance: 0 }), total_withdrawn: paidOut.rows[0].total_withdrawn }, transactions: transactions.rows, withdrawals: withdrawals.rows };
  }
  const [wallet, transactions, withdrawals, paidOut] = await Promise.all([
    mongoDb.collection('wallets').findOne({ owner_id: ownerId }),
    mongoDb.collection('wallet_transactions').find({ owner_id: ownerId }).sort({ created_at: -1 }).limit(100).toArray(),
    mongoDb.collection('withdrawals').find({ owner_id: ownerId }).sort({ created_at: -1 }).limit(50).toArray(),
    mongoDb.collection('withdrawals').aggregate([
      { $match: { owner_id: ownerId, status: { $in: ['paid', 'completed'] } } },
      { $group: { _id: null, total_withdrawn: { $sum: '$amount' } } },
    ]).toArray(),
  ]);
  return { wallet: { ...(wallet || { available_balance: 0, held_balance: 0 }), total_withdrawn: paidOut[0]?.total_withdrawn || 0 }, transactions, withdrawals };
};

export const createWithdrawalRequest = async ({ ownerId, amount, idempotencyKey }) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) throw new Error('Enter a valid withdrawal amount.');
  if (!idempotencyKey || idempotencyKey.length > 255) throw new Error('Idempotency-Key is required.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT * FROM withdrawals WHERE owner_id=$1 AND idempotency_key=$2', [ownerId, idempotencyKey]);
      if (prior.rowCount) { await client.query('COMMIT'); return prior.rows[0]; }
      const wallet = await client.query('SELECT * FROM wallets WHERE owner_id=$1 FOR UPDATE', [ownerId]);
      if (!wallet.rowCount || Number(wallet.rows[0].available_balance) < value) throw new Error('Insufficient available wallet balance.');
      const settings = await client.query("SELECT value FROM platform_settings WHERE key='minimum_withdrawal_amount'");
      const minimum = Number(settings.rows[0]?.value?.amount ?? settings.rows[0]?.value ?? 0);
      if (value < minimum) throw new Error(`Minimum withdrawal amount is ${minimum} BDT.`);
      const profile = await client.query('SELECT payout_method,payout_details FROM turf_owner_profiles WHERE user_id=$1 AND approval_status=$2', [ownerId, 'active']);
      if (!profile.rowCount) throw new Error('An approved owner payout method is required.');
      const inserted = await client.query(
        `INSERT INTO withdrawals (owner_id,amount,status,method,idempotency_key) VALUES ($1,$2,'pending',$3,$4) RETURNING *`,
        [ownerId, value, profile.rows[0].payout_method, idempotencyKey]
      );
      const withdrawal = inserted.rows[0];
      await client.query('UPDATE wallets SET available_balance=available_balance-$2,updated_at=NOW() WHERE owner_id=$1', [ownerId, value]);
      await client.query(
        `INSERT INTO wallet_transactions (owner_id,withdrawal_id,transaction_type,amount,idempotency_key,description)
         VALUES ($1,$2,'withdrawal_debit',$3,$4,'Withdrawal request reserve')`, [ownerId, withdrawal.id, value, `withdrawal:${withdrawal.id}:reserve`]
      );
      await client.query('COMMIT');
      return withdrawal;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const prior = await mongoDb.collection('withdrawals').findOne({ owner_id: ownerId, idempotency_key: idempotencyKey }, { session });
      if (prior) { created = prior; return; }
      const wallet = await mongoDb.collection('wallets').findOne({ owner_id: ownerId }, { session });
      if (!wallet || Number(wallet.available_balance) < value) throw new Error('Insufficient available wallet balance.');
      const setting = await mongoDb.collection('platform_settings').findOne({ key: 'minimum_withdrawal_amount' }, { session });
      const minimum = Number(setting?.value?.amount ?? setting?.value ?? 0);
      if (value < minimum) throw new Error(`Minimum withdrawal amount is ${minimum} BDT.`);
      const profile = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId, approval_status: 'active' }, { session });
      if (!profile) throw new Error('An approved owner payout method is required.');
      const now = new Date().toISOString();
      created = { id: crypto.randomUUID(), owner_id: ownerId, amount: value, status: 'pending', method: profile.payout_method, idempotency_key: idempotencyKey, created_at: now };
      await mongoDb.collection('withdrawals').insertOne(created, { session });
      await mongoDb.collection('wallets').updateOne({ owner_id: ownerId, available_balance: { $gte: value } }, { $inc: { available_balance: -value }, $set: { updated_at: now } }, { session });
      await mongoDb.collection('wallet_transactions').insertOne({ id: crypto.randomUUID(), owner_id: ownerId, withdrawal_id: created.id, transaction_type: 'withdrawal_debit', amount: value, idempotency_key: `withdrawal:${created.id}:reserve`, description: 'Withdrawal request reserve', created_at: now }, { session });
    });
    return created;
  } finally { await session.endSession(); }
};

export const listPendingWithdrawals = async () => {
  const rows = dbProvider === 'postgres'
    ? (await pool.query("SELECT w.*,u.name,u.email,u.phone,op.payout_details FROM withdrawals w JOIN users u ON u.id=w.owner_id JOIN turf_owner_profiles op ON op.user_id=w.owner_id WHERE w.status='pending' ORDER BY w.created_at")).rows
    : await mongoDb.collection('withdrawals').aggregate([
    { $match: { status: 'pending' } },
    { $lookup: { from: 'users', localField: 'owner_id', foreignField: 'id', as: 'owner' } },
    { $unwind: '$owner' },
    { $lookup: { from: 'turf_owner_profiles', localField: 'owner_id', foreignField: 'user_id', as: 'profile' } },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    { $addFields: { name: '$owner.name', email: '$owner.email', phone: '$owner.phone', payout_details: '$profile.payout_details' } },
    { $project: { owner: 0, profile: 0 } },
    { $sort: { created_at: 1 } },
    ]).toArray();
  return rows.map((row) => ({ ...row, payout_details: decryptPayoutDetails(row.payout_details) }));
};

export const decideWithdrawal = async ({ withdrawalId, adminId, decision, reference, reason }) => {
  if (!['approve', 'reject', 'paid'].includes(decision)) throw new Error('Invalid withdrawal decision.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE', [withdrawalId]);
      const withdrawal = result.rows[0];
      if (!withdrawal || (decision === 'paid' ? withdrawal.status !== 'approved' : withdrawal.status !== 'pending')) throw new Error('Withdrawal is not in a state that can receive this decision.');
      const status = decision === 'approve' ? 'approved' : decision === 'paid' ? 'paid' : 'rejected';
      const updated = await client.query('UPDATE withdrawals SET status=$2::varchar,reference=COALESCE($3,reference),rejection_reason=CASE WHEN $2::varchar=\'rejected\' THEN $4 ELSE rejection_reason END,reviewed_by=$5,reviewed_at=NOW() WHERE id=$1 RETURNING *', [withdrawalId, status, reference || null, reason || null, adminId]);
      if (decision === 'reject') {
        await client.query('UPDATE wallets SET available_balance=available_balance+$2,updated_at=NOW() WHERE owner_id=$1', [withdrawal.owner_id, withdrawal.amount]);
        await client.query("INSERT INTO wallet_transactions (owner_id,withdrawal_id,transaction_type,amount,idempotency_key,description) VALUES ($1,$2,'manual_adjustment',$3,$4,'Rejected withdrawal returned to available balance') ON CONFLICT (idempotency_key) DO NOTHING", [withdrawal.owner_id, withdrawalId, withdrawal.amount, `withdrawal:${withdrawalId}:rejected-return`]);
      }
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,after_value) VALUES ($1,'admin',$2,'withdrawal',$3,$4,$5::jsonb)", [adminId, `withdrawal_${status}`, withdrawalId, reference || null, JSON.stringify({ status })]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const withdrawal = await mongoDb.collection('withdrawals').findOne({ id: withdrawalId }, { session });
      if (!withdrawal || (decision === 'paid' ? withdrawal.status !== 'approved' : withdrawal.status !== 'pending')) throw new Error('Withdrawal is not in a state that can receive this decision.');
      const status = decision === 'approve' ? 'approved' : decision === 'paid' ? 'paid' : 'rejected';
      const now = new Date().toISOString();
      await mongoDb.collection('withdrawals').updateOne({ id: withdrawalId, status: withdrawal.status }, { $set: { status, reference: reference || withdrawal.reference, rejection_reason: decision === 'reject' ? reason || null : withdrawal.rejection_reason || null, reviewed_by: adminId, reviewed_at: now } }, { session });
      if (decision === 'reject') {
        await mongoDb.collection('wallets').updateOne({ owner_id: withdrawal.owner_id }, { $inc: { available_balance: Number(withdrawal.amount) }, $set: { updated_at: now } }, { session });
        await mongoDb.collection('wallet_transactions').insertOne({ id: crypto.randomUUID(), owner_id: withdrawal.owner_id, withdrawal_id: withdrawalId, transaction_type: 'manual_adjustment', amount: withdrawal.amount, idempotency_key: `withdrawal:${withdrawalId}:rejected-return`, description: 'Rejected withdrawal returned to available balance', created_at: now }, { session });
      }
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: `withdrawal_${status}`, entity_type: 'withdrawal', entity_id: withdrawalId, reason: reference || null, created_at: now }, { session });
      updated = { ...withdrawal, status, rejection_reason: decision === 'reject' ? reason || null : withdrawal.rejection_reason };
    });
    return updated;
  } finally { await session.endSession(); }
};

export const readAdminSettings = async () => dbProvider === 'postgres'
  ? Object.fromEntries((await pool.query('SELECT key,value FROM platform_settings ORDER BY key')).rows.map((row) => [row.key, row.value]))
  : Object.fromEntries((await mongoDb.collection('platform_settings').find({}).toArray()).map((row) => [row.key, row.value]));

const encryptGatewaySecret = (secret) => {
  if (!sslcommerzEncryptionKey) throw new Error('Set SSLCOMMERZ_CONFIG_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sslcommerzEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { __encrypted: 'aes-256-gcm:v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};
const decryptGatewaySecret = (value) => {
  if (value?.__encrypted !== 'aes-256-gcm:v1' || !sslcommerzEncryptionKey) throw new Error('SSLCommerz credentials cannot be decrypted; verify SSLCOMMERZ_CONFIG_ENCRYPTION_KEY.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sslcommerzEncryptionKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};
const readSslcommerzRecord = async () => dbProvider === 'postgres'
  ? (await pool.query("SELECT value FROM platform_settings WHERE key='sslcommerz_config'")).rows[0]?.value
  : (await mongoDb.collection('platform_settings').findOne({ key: 'sslcommerz_config' }))?.value;
export const getSslcommerzConfig = async () => {
  const config = await readSslcommerzRecord();
  if (!config) return null;
  return { storeId: config.storeId || '', storePassword: decryptGatewaySecret(config.storePasswordEncrypted), isSandbox: config.isSandbox !== false, isActive: Boolean(config.isActive) };
};
export const getSafeSslcommerzConfig = async () => {
  const config = await readSslcommerzRecord();
  return { id: 'gateway-sslcommerz', provider: 'sslcommerz', label: config?.label || 'SSLCommerz', storeId: config?.storeId || '', apiKey: '', apiSecret: '', passwordSet: Boolean(config?.storePasswordEncrypted), isSandbox: config?.isSandbox !== false, isActive: Boolean(config?.isActive) };
};

const paymentGatewayConfigDefinitions = {
  surjopay: { key: 'shurjopay_config', label: 'ShurjoPay', encryptionKey: shurjopayEncryptionKey, encryptionKeyName: 'SHURJOPAY_CONFIG_ENCRYPTION_KEY' },
  uddoktapay: { key: 'uddoktapay_config', label: 'UddoktaPay', encryptionKey: uddoktapayEncryptionKey, encryptionKeyName: 'UDDOKTAPAY_CONFIG_ENCRYPTION_KEY' },
};

const readPaymentGatewayConfigRecord = async (provider) => {
  const definition = paymentGatewayConfigDefinitions[provider];
  if (!definition) throw new Error('Unsupported payment gateway provider.');
  return dbProvider === 'postgres'
    ? (await pool.query('SELECT value FROM platform_settings WHERE key=$1', [definition.key])).rows[0]?.value
    : (await mongoDb.collection('platform_settings').findOne({ key: definition.key }))?.value;
};

const encryptPaymentGatewaySecret = (value, provider) => {
  const definition = paymentGatewayConfigDefinitions[provider];
  if (!definition.encryptionKey) throw new Error(`Set ${definition.encryptionKeyName} to a 32-byte base64 or 64-character hexadecimal key.`);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', definition.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { __encrypted: 'aes-256-gcm:v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};

const decryptPaymentGatewaySecret = (value, provider) => {
  const definition = paymentGatewayConfigDefinitions[provider];
  if (!value?.__encrypted || !definition.encryptionKey) throw new Error(`${definition.label} credentials cannot be decrypted; verify ${definition.encryptionKeyName}.`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', definition.encryptionKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

export const getPaymentGatewayConfig = async (provider) => {
  const record = await readPaymentGatewayConfigRecord(provider);
  if (!record) return null;
  if (provider === 'surjopay') return { prefix: record.prefix || '', username: record.username || '', password: record.passwordEncrypted ? decryptPaymentGatewaySecret(record.passwordEncrypted, provider) : '', isSandbox: record.isSandbox !== false, isActive: Boolean(record.isActive) };
  return { baseUrl: record.baseUrl || '', apiKey: record.apiKeyEncrypted ? decryptPaymentGatewaySecret(record.apiKeyEncrypted, provider) : '', automatedRefundsEnabled: Boolean(record.automatedRefundsEnabled), isSandbox: record.isSandbox !== false, isActive: Boolean(record.isActive) };
};

export const getSafePaymentGatewayConfig = async (provider) => {
  const definition = paymentGatewayConfigDefinitions[provider];
  if (!definition) throw new Error('Unsupported payment gateway provider.');
  const record = await readPaymentGatewayConfigRecord(provider);
  if (provider === 'surjopay') return {
    id: `gateway-${provider}`, provider, label: record?.label || definition.label, prefix: record?.prefix || '', username: record?.username || '', password: '', passwordSet: Boolean(record?.passwordEncrypted),
    isSandbox: record?.isSandbox !== false, isActive: Boolean(record?.isActive && record?.passwordEncrypted && definition.encryptionKey),
  };
  return {
    id: `gateway-${provider}`, provider, label: record?.label || definition.label, baseUrl: record?.baseUrl || '', apiKey: '', apiKeySet: Boolean(record?.apiKeyEncrypted), automatedRefundsEnabled: Boolean(record?.automatedRefundsEnabled),
    isSandbox: record?.isSandbox !== false, isActive: Boolean(record?.isActive && record?.apiKeyEncrypted && definition.encryptionKey),
  };
};

export const listSafePaymentGatewayConfigs = async () => [
  await getSafeSslcommerzConfig(),
  await getSafePaymentGatewayConfig('surjopay'),
  await getSafePaymentGatewayConfig('uddoktapay'),
];

export const savePaymentGatewayConfig = async ({ provider, config, adminId }) => {
  const definition = paymentGatewayConfigDefinitions[provider];
  if (!definition) throw new Error('Unsupported payment gateway provider.');
  const prior = await readPaymentGatewayConfigRecord(provider);
  const record = {
    label: String(config.label || definition.label).trim().slice(0, 120),
    isSandbox: Boolean(config.isSandbox),
    isActive: Boolean(config.isActive),
  };
  if (provider === 'surjopay') {
    record.prefix = String(config.prefix || '').trim().slice(0, 40);
    record.username = String(config.username || '').trim().slice(0, 120);
    record.passwordEncrypted = String(config.password || '').trim()
      ? encryptPaymentGatewaySecret(String(config.password).trim(), provider)
      : prior?.passwordEncrypted || null;
    if (record.isActive && (!record.prefix || !record.username || !record.passwordEncrypted)) throw new Error('ShurjoPay prefix, username, and password are required before enabling this gateway.');
  } else {
    record.apiKeyEncrypted = String(config.apiKey || '').trim()
      ? encryptPaymentGatewaySecret(String(config.apiKey).trim(), provider)
      : prior?.apiKeyEncrypted || null;
    record.automatedRefundsEnabled = config.automatedRefundsEnabled === true;
    record.baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '').slice(0, 300);
    if (record.baseUrl) {
      let parsed;
      try { parsed = new URL(record.baseUrl); } catch { throw new Error('Enter a valid UddoktaPay API base URL.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('UddoktaPay API base URL must be an HTTPS origin without credentials, a path, query, or fragment.');
    }
    if (record.isActive && (!record.apiKeyEncrypted || (!record.isSandbox && !record.baseUrl))) throw new Error('UddoktaPay API key and a production API base URL are required before enabling this gateway.');
  }
  const secretSet = provider === 'surjopay' ? Boolean(record.passwordEncrypted) : Boolean(record.apiKeyEncrypted);
  const before = provider === 'surjopay'
    ? { label: prior?.label || definition.label, prefix: prior?.prefix || '', username: prior?.username || '', passwordSet: Boolean(prior?.passwordEncrypted), isSandbox: prior?.isSandbox !== false, isActive: Boolean(prior?.isActive) }
    : { label: prior?.label || definition.label, baseUrl: prior?.baseUrl || '', apiKeySet: Boolean(prior?.apiKeyEncrypted), automatedRefundsEnabled: Boolean(prior?.automatedRefundsEnabled), isSandbox: prior?.isSandbox !== false, isActive: Boolean(prior?.isActive) };
  const after = provider === 'surjopay'
    ? { label: record.label, prefix: record.prefix, username: record.username, passwordSet: secretSet, isSandbox: record.isSandbox, isActive: record.isActive }
    : { label: record.label, baseUrl: record.baseUrl, apiKeySet: secretSet, automatedRefundsEnabled: record.automatedRefundsEnabled, isSandbox: record.isSandbox, isActive: record.isActive };
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO platform_settings (key,value,updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()', [definition.key, JSON.stringify(record)]);
      await client.query('INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,reason,before_value,after_value) VALUES ($1,\'admin\',$2,\'platform_setting\',$3,$4::jsonb,$5::jsonb)', [adminId, `${provider}_configuration_updated`, definition.key, JSON.stringify(before), JSON.stringify(after)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } else {
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await mongoDb.collection('platform_settings').updateOne({ key: definition.key }, { $set: { value: record, updated_at: now } }, { upsert: true, session });
        await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: `${provider}_configuration_updated`, entity_type: 'platform_setting', reason: definition.key, before_value: before, after_value: after, created_at: now }, { session });
      });
    } finally { await session.endSession(); }
  }
  return getSafePaymentGatewayConfig(provider);
};
export const saveSslcommerzConfig = async ({ config, adminId }) => {
  if (!sslcommerzEncryptionKey) throw new Error('Set SSLCOMMERZ_CONFIG_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const prior = await readSslcommerzRecord();
  const password = String(config.apiSecret || '').trim() || (prior?.storePasswordEncrypted ? decryptGatewaySecret(prior.storePasswordEncrypted) : '');
  if (config.isActive && (!String(config.storeId || '').trim() || !password)) throw new Error('Store ID and Store Password are required before enabling SSLCommerz.');
  const record = {
    label: String(config.label || 'SSLCommerz').trim().slice(0, 120),
    storeId: String(config.storeId || '').trim().slice(0, 120),
    storePasswordEncrypted: password ? encryptGatewaySecret(password) : null,
    isSandbox: Boolean(config.isSandbox), isActive: Boolean(config.isActive),
  };
  const before = { label: prior?.label || '', storeId: prior?.storeId || '', passwordSet: Boolean(prior?.storePasswordEncrypted), isSandbox: prior?.isSandbox !== false, isActive: Boolean(prior?.isActive) };
  const after = { label: record.label, storeId: record.storeId, passwordSet: Boolean(record.storePasswordEncrypted), isSandbox: record.isSandbox, isActive: record.isActive };
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO platform_settings (key,value,updated_at) VALUES ('sslcommerz_config',$1::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [JSON.stringify(record)]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,reason,before_value,after_value) VALUES ($1,'admin','sslcommerz_configuration_updated','platform_setting','sslcommerz_config',$2::jsonb,$3::jsonb)", [adminId, JSON.stringify(before), JSON.stringify(after)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } else {
    const session = mongoClient.startSession();
    try { await session.withTransaction(async () => {
      await mongoDb.collection('platform_settings').updateOne({ key: 'sslcommerz_config' }, { $set: { value: record, updated_at: now } }, { upsert: true, session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'sslcommerz_configuration_updated', entity_type: 'platform_setting', reason: 'sslcommerz_config', before_value: before, after_value: after, created_at: now }, { session });
    }); } finally { await session.endSession(); }
  }
  return { ...after, id: 'gateway-sslcommerz', provider: 'sslcommerz', apiKey: '', apiSecret: '' };
};

const encryptSmtpPassword = (password) => {
  if (!smtpEncryptionKey) throw new Error('Set SMTP_CONFIG_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', smtpEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { __encrypted: 'aes-256-gcm:v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};

const decryptSmtpPassword = (value) => {
  if (!value?.__encrypted) return '';
  if (value.__encrypted !== 'aes-256-gcm:v1' || !smtpEncryptionKey) throw new Error('SMTP credentials cannot be decrypted; verify SMTP_CONFIG_ENCRYPTION_KEY.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', smtpEncryptionKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

const encryptPushSubscription = (subscription) => {
  if (!pushSubscriptionEncryptionKey) throw new Error('Set PUSH_SUBSCRIPTION_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', pushSubscriptionEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(subscription), 'utf8'), cipher.final()]);
  return { __encrypted: 'aes-256-gcm:v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};

const decryptPushSubscription = (value) => {
  if (!pushSubscriptionEncryptionKey) throw new Error('PUSH_SUBSCRIPTION_ENCRYPTION_KEY is required to read push subscriptions.');
  if (value?.__encrypted !== 'aes-256-gcm:v1') throw new Error('Stored push subscription is not in the expected encrypted format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', pushSubscriptionEncryptionKey, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
};

const readSmtpConfigRecords = async () => {
  const value = dbProvider === 'postgres'
    ? (await pool.query("SELECT value FROM platform_settings WHERE key='smtp_configs'")).rows[0]?.value
    : (await mongoDb.collection('platform_settings').findOne({ key: 'smtp_configs' }))?.value;
  return Array.isArray(value) ? value : [];
};

export const listSmtpConfigs = async () => (await readSmtpConfigRecords()).map((config) => ({
  ...config,
  password: decryptSmtpPassword(config.password_encrypted),
  passwordSet: Boolean(config.password_encrypted),
  password_encrypted: undefined,
}));

export const saveSmtpConfigs = async ({ configs, adminId }) => {
  if (!smtpEncryptionKey) throw new Error('Set SMTP_CONFIG_ENCRYPTION_KEY to a 32-byte base64 or 64-character hexadecimal key.');
  const prior = await listSmtpConfigs();
  const priorById = new Map(prior.map((config) => [config.id, config]));
  const records = configs.map((config) => {
    const existing = priorById.get(config.id);
    const password = typeof config.password === 'string' && config.password.length ? config.password : existing?.password;
    if (!password) throw new Error(`SMTP password is required for ${config.id}.`);
    const { password: _password, passwordSet: _passwordSet, ...metadata } = config;
    return { ...metadata, password_encrypted: encryptSmtpPassword(password) };
  });
  const auditView = (items) => items.map(({ id, label, host, port, secure, username, fromName, fromEmail, isActive }) => ({ id, label, host, port, secure, username, fromName, fromEmail, isActive }));
  const before = auditView(prior);
  const after = auditView(configs);
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO platform_settings (key,value,updated_at) VALUES ('smtp_configs',$1::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()", [JSON.stringify(records)]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,reason,before_value,after_value) VALUES ($1,'admin','smtp_configuration_updated','platform_setting','smtp_configs',$2::jsonb,$3::jsonb)", [adminId, JSON.stringify(before), JSON.stringify(after)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } else {
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await mongoDb.collection('platform_settings').updateOne({ key: 'smtp_configs' }, { $set: { value: records, updated_at: now } }, { upsert: true, session });
        await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'smtp_configuration_updated', entity_type: 'platform_setting', reason: 'smtp_configs', before_value: before, after_value: after, created_at: now }, { session });
      });
    } finally { await session.endSession(); }
  }
  return records.map((config) => ({ ...config, password: '', password_encrypted: undefined, passwordSet: true }));
};

export const writeAdminSetting = async ({ key, value, adminId }) => {
  if (dbProvider === 'postgres') {
    const prior = await pool.query('SELECT value FROM platform_settings WHERE key=$1', [key]);
    const result = await pool.query(
      `INSERT INTO platform_settings (key,value,updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING value`,
      [key, JSON.stringify(value)]
    );
    await pool.query(
      `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,reason,before_value,after_value)
       VALUES ($1,'admin','setting_updated','platform_setting',$2,$3::jsonb,$4::jsonb)`,
      [adminId, key, prior.rows[0] ? JSON.stringify(prior.rows[0].value) : null, JSON.stringify(value)]
    );
    return result.rows[0].value;
  }
  const prior = await mongoDb.collection('platform_settings').findOne({ key });
  await mongoDb.collection('platform_settings').updateOne({ key }, { $set: { value, updated_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'setting_updated', entity_type: 'platform_setting', reason: key, before_value: prior?.value ?? null, after_value: value, created_at: new Date().toISOString() });
  return value;
};

export const listSubscriptionOwners = async () => {
  if (dbProvider === 'postgres') {
    return (await pool.query(
      `SELECT op.user_id,u.name,u.email,op.business_name,op.billing_model,op.approval_status,
        op.subscription_due_date::text,op.subscription_due_amount,op.subscription_paid_through::text,
        op.subscription_paid_at,op.subscription_payment_reference,op.pending_billing_model,
        op.billing_model_change_effective_date::text,
        (SELECT COUNT(*)::int FROM turfs t WHERE t.owner_id=op.user_id AND t.subscription_disabled_at IS NOT NULL) AS subscription_disabled_turfs
       FROM turf_owner_profiles op JOIN users u ON u.id=op.user_id
      WHERE op.billing_model='monthly_subscription' OR op.pending_billing_model='monthly_subscription' ORDER BY u.name`
    )).rows;
  }
  const profiles = await mongoDb.collection('turf_owner_profiles').find({ $or: [{ billing_model: 'monthly_subscription' }, { pending_billing_model: 'monthly_subscription' }] }).toArray();
  const users = await mongoDb.collection('users').find({ id: { $in: profiles.map((profile) => profile.user_id) } }).toArray();
  const userById = new Map(users.map((user) => [user.id, user]));
  return Promise.all(profiles.filter((profile) => userById.has(profile.user_id)).map(async (profile) => ({
    ...profile,
    name: userById.get(profile.user_id).name,
    email: userById.get(profile.user_id).email,
    pending_billing_model: profile.pending_billing_model || null,
    billing_model_change_effective_date: profile.billing_model_change_effective_date || null,
    subscription_disabled_turfs: await mongoDb.collection('turfs').countDocuments({ owner_id: profile.user_id, subscription_disabled_at: { $exists: true, $ne: null } }),
  })));
};

export const scheduleOwnerBillingModelChange = async ({ ownerId, billingModel }) => {
  const settings = await readAdminSettings();
  if (settings.owner_billing_switch_enabled !== true) throw new Error('Owner billing model changes are disabled by the platform admin.');
  if (billingModel !== null && !['commission', 'monthly_subscription'].includes(billingModel)) throw new Error('Choose a valid billing model or clear the pending change.');
  if (billingModel === 'monthly_subscription' && Number(settings.monthly_subscription_amount || 0) <= 0) throw new Error('Monthly subscription is not currently available.');
  const effectiveDate = firstOfNextMonth(getDhakaDateString());
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const priorResult = await client.query('SELECT billing_model,pending_billing_model,billing_model_change_effective_date::text,approval_status FROM turf_owner_profiles WHERE user_id=$1 FOR UPDATE', [ownerId]);
      const prior = priorResult.rows[0];
      if (!prior || prior.approval_status !== 'active') throw new Error('An approved owner profile was not found.');
      if (billingModel === prior.billing_model) throw new Error('Choose the other billing model.');
      await client.query('UPDATE turf_owner_profiles SET pending_billing_model=$2,billing_model_change_effective_date=$3::date,updated_at=NOW() WHERE user_id=$1', [ownerId, billingModel, billingModel ? effectiveDate : null]);
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,before_value,after_value)
         VALUES ($1,'turf_owner','owner_billing_change_scheduled','turf_owner_profile',$1,$2::jsonb,$3::jsonb)`,
        [ownerId, JSON.stringify({ billingModel: prior.billing_model, pendingBillingModel: prior.pending_billing_model, effectiveDate: prior.billing_model_change_effective_date }), JSON.stringify({ pendingBillingModel: billingModel, effectiveDate: billingModel ? effectiveDate : null })]
      );
      await client.query('COMMIT');
      return { billingModel: prior.billing_model, pendingBillingModel: billingModel, effectiveDate: billingModel ? effectiveDate : null };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const profiles = mongoDb.collection('turf_owner_profiles');
      const prior = await profiles.findOne({ user_id: ownerId, approval_status: 'active' }, { session });
      if (!prior) throw new Error('An approved owner profile was not found.');
      if (billingModel === prior.billing_model) throw new Error('Choose the other billing model.');
      await profiles.updateOne({ user_id: ownerId }, { $set: { pending_billing_model: billingModel, billing_model_change_effective_date: billingModel ? effectiveDate : null, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'owner_billing_change_scheduled', entity_type: 'turf_owner_profile', entity_id: ownerId, before_value: { billingModel: prior.billing_model, pendingBillingModel: prior.pending_billing_model || null, effectiveDate: prior.billing_model_change_effective_date || null }, after_value: { pendingBillingModel: billingModel, effectiveDate: billingModel ? effectiveDate : null }, created_at: now }, { session });
      result = { billingModel: prior.billing_model, pendingBillingModel: billingModel, effectiveDate: billingModel ? effectiveDate : null };
    });
    return result;
  } finally { await session.endSession(); }
};

export const recordOwnerSubscriptionPayment = async ({ ownerId, adminId, receivedAt, reference }) => {
  const now = new Date().toISOString();
  const settings = await readAdminSettings();
  const nextAmount = Number(settings.monthly_subscription_amount || 0);
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT user_id,billing_model,approval_status,subscription_due_date::text AS due_date,
          subscription_due_amount,subscription_paid_through::text AS paid_through FROM turf_owner_profiles WHERE user_id=$1 FOR UPDATE`, [ownerId]
      );
      const profile = found.rows[0];
      if (!profile || profile.billing_model !== 'monthly_subscription' || profile.approval_status !== 'active' || !profile.due_date) throw new Error('Active subscription owner was not found.');
      const inserted = await client.query(
        `INSERT INTO owner_subscription_payments (owner_id,billing_period_end,amount,received_at,reference,recorded_by)
         VALUES ($1,$2::date,$3,$4,$5,$6) ON CONFLICT (owner_id,billing_period_end) DO NOTHING RETURNING id`,
        [ownerId, profile.due_date, Number(profile.subscription_due_amount ?? nextAmount), receivedAt || now, reference || null, adminId]
      );
      if (!inserted.rowCount) throw new Error('Payment is already recorded for this billing period.');
      const dueDate = nextMonthEnd(profile.due_date);
      await client.query(
        `UPDATE turf_owner_profiles SET subscription_paid_through=$2::date,subscription_paid_at=$3,
          subscription_payment_reference=$4,subscription_due_date=$5::date,subscription_due_amount=NULL,updated_at=NOW()
         WHERE user_id=$1`, [ownerId, profile.due_date, receivedAt || now, reference || null, dueDate]
      );
      await client.query('UPDATE turfs SET status=\'active\',subscription_disabled_at=NULL,updated_at=NOW() WHERE owner_id=$1 AND subscription_disabled_at IS NOT NULL', [ownerId]);
      await client.query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1 AND data->>'subscriptionPeriod'=$2", [ownerId, profile.due_date]);
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,after_value)
         VALUES ($1,'admin','owner_subscription_payment_recorded','turf_owner_profile',$2,$3,$4::jsonb)`,
        [adminId, ownerId, reference || null, JSON.stringify({ billingPeriodEnd: profile.due_date, receivedAt: receivedAt || now })]
      );
      await client.query('COMMIT');
      return { ownerId, billingPeriodEnd: profile.due_date, nextDueDate: dueDate, receivedAt: receivedAt || now, reference: reference || null };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const profiles = mongoDb.collection('turf_owner_profiles');
      const profile = await profiles.findOne({ user_id: ownerId, billing_model: 'monthly_subscription', approval_status: 'active' }, { session });
      if (!profile?.subscription_due_date) throw new Error('Active subscription owner was not found.');
      const periodEnd = String(profile.subscription_due_date).slice(0, 10);
      const amount = Number(profile.subscription_due_amount ?? nextAmount);
      const payment = { id: crypto.randomUUID(), owner_id: ownerId, billing_period_end: periodEnd, amount, received_at: receivedAt || now, reference: reference || null, recorded_by: adminId, created_at: now };
      try { await mongoDb.collection('owner_subscription_payments').insertOne(payment, { session }); }
      catch (error) { if (error.code === 11000) throw new Error('Payment is already recorded for this billing period.'); throw error; }
      const dueDate = nextMonthEnd(periodEnd);
      await profiles.updateOne({ user_id: ownerId }, { $set: { subscription_paid_through: periodEnd, subscription_paid_at: receivedAt || now, subscription_payment_reference: reference || null, subscription_due_date: dueDate, subscription_due_amount: null, updated_at: now } }, { session });
      await mongoDb.collection('turfs').updateMany({ owner_id: ownerId, subscription_disabled_at: { $exists: true, $ne: null } }, { $set: { status: 'active', subscription_disabled_at: null, updated_at: now } }, { session });
      await mongoDb.collection('notifications').updateMany({ user_id: ownerId, 'data.subscriptionPeriod': periodEnd, read_at: null }, { $set: { read_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'owner_subscription_payment_recorded', entity_type: 'turf_owner_profile', entity_id: ownerId, reason: reference || null, after_value: { billingPeriodEnd: periodEnd, receivedAt: receivedAt || now }, created_at: now }, { session });
      result = { ownerId, billingPeriodEnd: periodEnd, nextDueDate: dueDate, receivedAt: receivedAt || now, reference: reference || null };
    });
    return result;
  } finally { await session.endSession(); }
};

const applyDueOwnerBillingChanges = async (today) => {
  const rows = dbProvider === 'postgres'
    ? (await pool.query(`SELECT user_id,billing_model,pending_billing_model,billing_model_change_effective_date::text AS effective_date,subscription_paid_through::text AS paid_through FROM turf_owner_profiles WHERE pending_billing_model IS NOT NULL AND billing_model_change_effective_date <= $1::date`, [today])).rows
    : (await mongoDb.collection('turf_owner_profiles').find({ pending_billing_model: { $ne: null }, billing_model_change_effective_date: { $lte: today } }).toArray()).map((profile) => ({ ...profile, effective_date: profile.billing_model_change_effective_date, paid_through: profile.subscription_paid_through }));
  const applied = [];
  for (const row of rows) {
    const effectiveDate = String(row.effective_date).slice(0, 10);
    const mustWaitForPayment = row.pending_billing_model === 'commission';
    if (mustWaitForPayment && (!row.paid_through || String(row.paid_through).slice(0, 10) < addCalendarDays(effectiveDate, -1))) continue;
    const now = new Date().toISOString();
    const subscriptionDueDate = row.pending_billing_model === 'monthly_subscription' ? monthEndForDate(effectiveDate) : null;
    if (dbProvider === 'postgres') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const priorResult = await client.query(`SELECT billing_model,pending_billing_model,billing_model_change_effective_date::text AS effective_date,subscription_paid_through::text AS paid_through FROM turf_owner_profiles WHERE user_id=$1 FOR UPDATE`, [row.user_id]);
        const prior = priorResult.rows[0];
        if (!prior || prior.pending_billing_model !== row.pending_billing_model || String(prior.effective_date).slice(0, 10) !== effectiveDate || (mustWaitForPayment && (!prior.paid_through || String(prior.paid_through).slice(0, 10) < addCalendarDays(effectiveDate, -1)))) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query(
          `UPDATE turf_owner_profiles SET billing_model=$2,pending_billing_model=NULL,billing_model_change_effective_date=NULL,
             subscription_due_date=$3::date,subscription_due_amount=NULL,updated_at=NOW() WHERE user_id=$1`,
          [row.user_id, row.pending_billing_model, subscriptionDueDate]
        );
        await client.query(`INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,before_value,after_value)
          VALUES ($1,'system','owner_billing_change_activated','turf_owner_profile',$1,$2::jsonb,$3::jsonb)`,
          [row.user_id, JSON.stringify({ billingModel: prior.billing_model, pendingBillingModel: prior.pending_billing_model }), JSON.stringify({ billingModel: row.pending_billing_model, effectiveDate })]);
        await client.query('COMMIT');
        applied.push({ ownerId: row.user_id, billingModel: row.pending_billing_model, effectiveDate });
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } else {
      const session = mongoClient.startSession();
      try {
        let changed = false;
        await session.withTransaction(async () => {
          const profiles = mongoDb.collection('turf_owner_profiles');
          const prior = await profiles.findOne({ user_id: row.user_id, pending_billing_model: row.pending_billing_model, billing_model_change_effective_date: effectiveDate }, { session });
          if (!prior || (mustWaitForPayment && (!prior.subscription_paid_through || String(prior.subscription_paid_through).slice(0, 10) < addCalendarDays(effectiveDate, -1)))) return;
          await profiles.updateOne({ user_id: row.user_id }, { $set: { billing_model: row.pending_billing_model, pending_billing_model: null, billing_model_change_effective_date: null, subscription_due_date: subscriptionDueDate, subscription_due_amount: null, updated_at: now } }, { session });
          await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: row.user_id, actor_role: 'system', action: 'owner_billing_change_activated', entity_type: 'turf_owner_profile', entity_id: row.user_id, before_value: { billingModel: prior.billing_model, pendingBillingModel: prior.pending_billing_model }, after_value: { billingModel: row.pending_billing_model, effectiveDate }, created_at: now }, { session });
          changed = true;
        });
        if (changed) applied.push({ ownerId: row.user_id, billingModel: row.pending_billing_model, effectiveDate });
      } finally { await session.endSession(); }
    }
  }
  return applied;
};

export const processOwnerSubscriptionCycle = async () => {
  const today = getDhakaDateString();
  const billingChanges = await applyDueOwnerBillingChanges(today);
  const settings = await readAdminSettings();
  const currentSubscriptionAmount = Number(settings.monthly_subscription_amount || 0);
  const profiles = dbProvider === 'postgres'
    ? (await pool.query(`SELECT user_id,subscription_due_date::text AS due_date,subscription_due_amount FROM turf_owner_profiles WHERE billing_model='monthly_subscription' AND approval_status='active' AND subscription_due_date IS NOT NULL`)).rows
    : (await mongoDb.collection('turf_owner_profiles').find({ billing_model: 'monthly_subscription', approval_status: 'active', subscription_due_date: { $ne: null } }).toArray()).map((profile) => ({ user_id: profile.user_id, due_date: String(profile.subscription_due_date).slice(0, 10), subscription_due_amount: profile.subscription_due_amount }));
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const reminders = [];
  const overdueOwners = [];
  for (const profile of profiles) {
    const dueDate = String(profile.due_date).slice(0, 10);
    const daysUntilDue = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - todayTime) / 86_400_000);
    if (daysUntilDue <= 0 && profile.subscription_due_amount == null && currentSubscriptionAmount > 0) {
      if (dbProvider === 'postgres') await pool.query('UPDATE turf_owner_profiles SET subscription_due_amount=$2,updated_at=NOW() WHERE user_id=$1 AND subscription_due_date=$3::date AND subscription_due_amount IS NULL', [profile.user_id, currentSubscriptionAmount, dueDate]);
      else await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: profile.user_id, subscription_due_date: dueDate, subscription_due_amount: null }, { $set: { subscription_due_amount: currentSubscriptionAmount, updated_at: new Date().toISOString() } });
    }
    if (daysUntilDue === 7 || daysUntilDue === 0) reminders.push({ ownerId: profile.user_id, dueDate, daysUntilDue });
    if (daysUntilDue < -5) {
      const now = new Date().toISOString();
      if (dbProvider === 'postgres') {
        const changed = await pool.query("UPDATE turfs SET status='inactive',subscription_disabled_at=NOW(),updated_at=NOW() WHERE owner_id=$1 AND status='active' AND subscription_disabled_at IS NULL RETURNING id", [profile.user_id]);
        if (changed.rowCount) overdueOwners.push({ ownerId: profile.user_id, dueDate, disabledCount: changed.rowCount });
      } else {
        const changed = await mongoDb.collection('turfs').updateMany({ owner_id: profile.user_id, status: 'active', $or: [{ subscription_disabled_at: null }, { subscription_disabled_at: { $exists: false } }] }, { $set: { status: 'inactive', subscription_disabled_at: now, updated_at: now } });
        if (changed.modifiedCount) overdueOwners.push({ ownerId: profile.user_id, dueDate, disabledCount: changed.modifiedCount });
      }
    }
  }
  return { reminders, overdueOwners, billingChanges };
};

const FEATURE_FLAG_KEYS = [
  'addons_enabled', 'squad_enabled', 'tournament_enabled', 'featured_turf_enabled',
  'featured_addon_enabled', 'whatsapp_enabled', 'trending_enabled', 'near_you_enabled',
];

const ensureFeatureFlagDefaults = async () => {
  if (dbProvider === 'postgres') {
    await pool.query(
      `INSERT INTO feature_flags (key,value) SELECT unnest($1::text[]), FALSE
       ON CONFLICT (key) DO NOTHING`, [FEATURE_FLAG_KEYS]
    );
  } else {
    await mongoDb.collection('feature_flags').createIndex({ key: 1 }, { unique: true });
    await Promise.all(FEATURE_FLAG_KEYS.map((key) => mongoDb.collection('feature_flags').updateOne(
      { key }, { $setOnInsert: { key, value: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } }, { upsert: true }
    )));
  }
};

export const listFeatureFlags = async () => {
  await ensureFeatureFlagDefaults();
  const rows = dbProvider === 'postgres'
    ? (await pool.query('SELECT key,value FROM feature_flags ORDER BY key')).rows
    : await mongoDb.collection('feature_flags').find({ key: { $in: FEATURE_FLAG_KEYS } }, { projection: { _id: 0, key: 1, value: 1 } }).sort({ key: 1 }).toArray();
  return Object.fromEntries(rows.map((row) => [row.key, Boolean(row.value)]));
};

export const setFeatureFlag = async ({ key, value, adminId }) => {
  if (!FEATURE_FLAG_KEYS.includes(key) || typeof value !== 'boolean') throw new Error('Invalid feature flag update.');
  await ensureFeatureFlagDefaults();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT value FROM feature_flags WHERE key=$1 FOR UPDATE', [key]);
      await client.query('UPDATE feature_flags SET value=$2,updated_at=NOW() WHERE key=$1', [key, value]);
      if (Boolean(prior.rows[0]?.value) !== value) {
        await client.query(
          `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,reason,before_value,after_value)
           VALUES ($1,'admin','feature_flag_toggled','feature_flag',$2,$3::jsonb,$4::jsonb)`,
          [adminId, key, JSON.stringify(Boolean(prior.rows[0]?.value)), JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
      return { key, value };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const flags = mongoDb.collection('feature_flags');
      const prior = await flags.findOne({ key }, { session });
      const now = new Date().toISOString();
      await flags.updateOne({ key }, { $set: { value, updated_at: now } }, { session });
      if (Boolean(prior?.value) !== value) {
        await mongoDb.collection('audit_logs').insertOne({
          id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'feature_flag_toggled',
          entity_type: 'feature_flag', reason: key, before_value: Boolean(prior?.value), after_value: value, created_at: now,
        }, { session });
      }
      updated = { key, value };
    });
    return updated;
  } finally { await session.endSession(); }
};

export const adminRevenueReport = async ({ from, to }) => {
  if (dbProvider === 'postgres') {
    const params = [];
    const where = [];
    if (from) { params.push(from); where.push(`booking_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`booking_date < $${params.length}::date + INTERVAL '1 day'`); }
    const grossStatuses = "('confirmed','checked_in','completed','partially_refunded')";
    const cancelStatuses = "('cancelled','refunded')";
    const dateFilter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT COUNT(*)::int AS booking_count,
       COALESCE(SUM(commission_amount + platform_fee_amount) FILTER (WHERE status IN ${grossStatuses}),0) AS platform_revenue,
       COALESCE(SUM(base_amount) FILTER (WHERE status IN ${grossStatuses}),0) AS gross_turf_revenue,
       COALESCE(SUM(net_owner_amount) FILTER (WHERE status IN ${grossStatuses}),0) AS net_owner_earnings,
       COUNT(*) FILTER (WHERE status IN ${grossStatuses})::int AS gross_booking_count,
       COUNT(*) FILTER (WHERE status IN ${cancelStatuses})::int AS cancelled_bookings,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ${cancelStatuses}) / NULLIF(COUNT(*),0),1) AS cancellation_rate
       FROM bookings ${dateFilter}`, params
    );
    const byOwner = await pool.query(
      `SELECT t.owner_id,u.name AS owner_name,COUNT(b.id)::int AS booking_count,
       COALESCE(SUM(b.commission_amount + b.platform_fee_amount) FILTER (WHERE b.status IN ${grossStatuses}),0) AS platform_revenue,
       COALESCE(SUM(b.base_amount) FILTER (WHERE b.status IN ('confirmed','checked_in','completed','partially_refunded')),0) AS gross_turf_revenue,
       COALESCE(SUM(b.net_owner_amount) FILTER (WHERE b.status IN ${grossStatuses}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id JOIN users u ON u.id=t.owner_id
       ${dateFilter ? `WHERE ${where.map((part) => part.replaceAll('booking_date', 'b.booking_date')).join(' AND ')}` : ''}
       GROUP BY t.owner_id,u.name ORDER BY platform_revenue DESC`, params
    );
    const byTurf = await pool.query(
      `SELECT t.id AS turf_id,t.name AS turf_name,t.owner_id,u.name AS owner_name,COUNT(b.id)::int AS booking_count,
       COALESCE(SUM(b.commission_amount + b.platform_fee_amount) FILTER (WHERE b.status IN ${grossStatuses}),0) AS platform_revenue,
       COALESCE(SUM(b.base_amount) FILTER (WHERE b.status IN ('confirmed','checked_in','completed','partially_refunded')),0) AS gross_turf_revenue,
       COALESCE(SUM(b.net_owner_amount) FILTER (WHERE b.status IN ${grossStatuses}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id JOIN users u ON u.id=t.owner_id
       ${dateFilter ? `WHERE ${where.map((part) => part.replaceAll('booking_date', 'b.booking_date')).join(' AND ')}` : ''}
       GROUP BY t.id,t.name,t.owner_id,u.name ORDER BY platform_revenue DESC`, params
    );
    const source = await pool.query(
      `SELECT booking_source AS source,COALESCE(SUM(base_amount),0) AS total FROM bookings ${dateFilter ? `${dateFilter} AND` : 'WHERE'} status IN ${grossStatuses} GROUP BY booking_source ORDER BY total DESC`, params
    );
    const daily = await pool.query(
      `SELECT booking_date::text AS date,COALESCE(SUM(base_amount),0) AS gross_turf_revenue FROM bookings ${dateFilter ? `${dateFilter} AND` : 'WHERE'} status IN ${grossStatuses} GROUP BY booking_date ORDER BY booking_date`, params
    );
    return { summary: result.rows[0], byOwner: byOwner.rows, byTurf: byTurf.rows, sourceBreakdown: source.rows, dailyTrend: daily.rows };
  }
  const match = {};
  if (from || to) match.booking_date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const bookings = await mongoDb.collection('bookings').find(match).toArray();
  const byOwner = new Map();
  const byTurf = new Map();
  const grossValueStatuses = new Set(['confirmed', 'checked_in', 'completed', 'partially_refunded']);
  const cancelledStatuses = new Set(['cancelled', 'refunded']);
  const sourceBreakdown = new Map();
  const dailyTrend = new Map();
  for (const booking of bookings) {
    const turf = await mongoDb.collection('turfs').findOne({ id: booking.turf_id });
    if (!turf) continue;
    const owner = await mongoDb.collection('users').findOne({ id: turf.owner_id }, { projection: { name: 1 } });
    const update = (entry) => {
      entry.booking_count += 1;
      if (grossValueStatuses.has(booking.status)) {
        entry.platform_revenue += Number(booking.commission_amount || 0) + Number(booking.platform_fee_amount || 0);
        entry.gross_turf_revenue += Number(booking.base_amount || 0);
        entry.net_owner_earnings += Number(booking.net_owner_amount || 0);
      }
    };
    const ownerEntry = byOwner.get(turf.owner_id) || { owner_id: turf.owner_id, owner_name: owner?.name || '', booking_count: 0, platform_revenue: 0, gross_turf_revenue: 0, net_owner_earnings: 0 };
    update(ownerEntry);
    byOwner.set(turf.owner_id, ownerEntry);
    const turfEntry = byTurf.get(turf.id) || { turf_id: turf.id, turf_name: turf.name, owner_id: turf.owner_id, owner_name: owner?.name || '', booking_count: 0, platform_revenue: 0, gross_turf_revenue: 0, net_owner_earnings: 0 };
    update(turfEntry);
    byTurf.set(turf.id, turfEntry);
  }
  const summary = bookings.reduce((acc, booking) => {
    if (grossValueStatuses.has(booking.status)) {
      const amount = Number(booking.base_amount || 0);
      acc.platform_revenue += Number(booking.commission_amount || 0) + Number(booking.platform_fee_amount || 0);
      acc.gross_turf_revenue += amount;
      acc.net_owner_earnings += Number(booking.net_owner_amount || 0);
      acc.gross_booking_count += 1;
      sourceBreakdown.set(booking.booking_source || 'online', (sourceBreakdown.get(booking.booking_source || 'online') || 0) + amount);
      dailyTrend.set(String(booking.booking_date).slice(0, 10), (dailyTrend.get(String(booking.booking_date).slice(0, 10)) || 0) + amount);
    }
    if (cancelledStatuses.has(booking.status)) acc.cancelled_bookings += 1;
    return acc;
  }, { booking_count: bookings.length, platform_revenue: 0, gross_turf_revenue: 0, net_owner_earnings: 0, gross_booking_count: 0, cancelled_bookings: 0 });
  summary.cancellation_rate = summary.booking_count ? Number((summary.cancelled_bookings * 100 / summary.booking_count).toFixed(1)) : 0;
  return {
    summary,
    byOwner: [...byOwner.values()],
    byTurf: [...byTurf.values()],
    sourceBreakdown: [...sourceBreakdown.entries()].map(([source, total]) => ({ source, total })).sort((a, b) => b.total - a.total),
    dailyTrend: [...dailyTrend.entries()].map(([date, gross_turf_revenue]) => ({ date, gross_turf_revenue })).sort((a, b) => a.date.localeCompare(b.date)),
  };
};

export const ownerRevenueReport = async (ownerId, { from, to }) => {
  const trackedStatuses = ['confirmed', 'checked_in', 'completed', 'cancelled', 'refunded', 'partially_refunded'];
  const revenueStatuses = ['confirmed', 'checked_in', 'completed', 'partially_refunded'];
  if (dbProvider === 'postgres') {
    const params = [ownerId];
    const where = [`t.owner_id=$1`, `b.status = ANY(ARRAY[${trackedStatuses.map((status) => `'${status}'`).join(',')}])`];
    if (from) { params.push(from); where.push(`b.booking_date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`b.booking_date <= $${params.length}::date`); }
    const revenueFilter = `b.status IN (${revenueStatuses.map((status) => `'${status}'`).join(',')})`;
    const summaryResult = await pool.query(
      `SELECT COUNT(*)::int AS booking_count,
       COUNT(*) FILTER (WHERE b.status='completed')::int AS completed_bookings,
       COUNT(*) FILTER (WHERE b.status IN ('cancelled','refunded'))::int AS cancelled_bookings,
       COALESCE(SUM(b.base_amount) FILTER (WHERE ${revenueFilter}),0) AS gross_revenue,
       COALESCE(SUM(b.net_owner_amount) FILTER (WHERE ${revenueFilter}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE ${where.join(' AND ')}`, params
    );
    const slotParams = [ownerId];
    let slotDateFilters = '';
    if (from) { slotParams.push(from); slotDateFilters += ` AND s.date >= $${slotParams.length}::date`; }
    if (to) { slotParams.push(to); slotDateFilters += ` AND s.date <= $${slotParams.length}::date`; }
    const utilizationResult = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE s.status='booked')::int AS booked_slots,COUNT(*) FILTER (WHERE s.status='available')::int AS available_slots
       FROM slots s JOIN turfs t ON t.id=s.turf_id WHERE t.owner_id=$1 AND s.status IN ('available','booked')${slotDateFilters}`, slotParams
    );
    const daily = await pool.query(
      `SELECT b.booking_date::text AS period,COUNT(*)::int AS booking_count,COALESCE(SUM(b.base_amount) FILTER (WHERE ${revenueFilter}),0) AS gross_revenue,COALESCE(SUM(b.net_owner_amount) FILTER (WHERE ${revenueFilter}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE ${where.join(' AND ')} GROUP BY b.booking_date ORDER BY b.booking_date`, params
    );
    const weekly = await pool.query(
      `SELECT to_char(date_trunc('week',b.booking_date),'YYYY-MM-DD') AS period,COUNT(*)::int AS booking_count,COALESCE(SUM(b.net_owner_amount) FILTER (WHERE ${revenueFilter}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE ${where.join(' AND ')} GROUP BY date_trunc('week',b.booking_date) ORDER BY date_trunc('week',b.booking_date)`, params
    );
    const monthly = await pool.query(
      `SELECT to_char(date_trunc('month',b.booking_date),'YYYY-MM') AS period,COUNT(*)::int AS booking_count,COALESCE(SUM(b.net_owner_amount) FILTER (WHERE ${revenueFilter}),0) AS net_owner_earnings
       FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE ${where.join(' AND ')} GROUP BY date_trunc('month',b.booking_date) ORDER BY date_trunc('month',b.booking_date)`, params
    );
    const summary = summaryResult.rows[0];
    const utilization = utilizationResult.rows[0];
    const bookedSlots = Number(utilization.booked_slots || 0);
    const availableSlots = Number(utilization.available_slots || 0);
    return {
      summary: { ...summary, booked_slots: bookedSlots, available_slots: availableSlots, utilization_rate: bookedSlots + availableSlots ? Number((bookedSlots * 100 / (bookedSlots + availableSlots)).toFixed(1)) : 0 },
      daily: daily.rows, weekly: weekly.rows, monthly: monthly.rows,
    };
  }
  const turfRows = await mongoDb.collection('turfs').find({ owner_id: ownerId }, { projection: { id: 1 } }).toArray();
  const turfIds = turfRows.map((turf) => turf.id);
  if (!turfIds.length) return { summary: { booking_count: 0, completed_bookings: 0, cancelled_bookings: 0, gross_revenue: 0, net_owner_earnings: 0, booked_slots: 0, available_slots: 0, utilization_rate: 0 }, daily: [], weekly: [], monthly: [] };
  const bookingFilter = { turf_id: { $in: turfIds }, status: { $in: trackedStatuses }, ...(from || to ? { booking_date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) };
  const slotFilter = { turf_id: { $in: turfIds }, status: { $in: ['available', 'booked'] }, ...(from || to ? { date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) };
  const [ownerBookings, ownerSlots] = await Promise.all([
    mongoDb.collection('bookings').find(bookingFilter).toArray(),
    mongoDb.collection('slots').find(slotFilter, { projection: { status: 1 } }).toArray(),
  ]);
  const revenueSet = new Set(revenueStatuses);
  const dailyMap = new Map();
  const weeklyMap = new Map();
  const monthlyMap = new Map();
  const summary = { booking_count: ownerBookings.length, completed_bookings: 0, cancelled_bookings: 0, gross_revenue: 0, net_owner_earnings: 0 };
  for (const booking of ownerBookings) {
    const date = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date || '').slice(0, 10);
    if (booking.status === 'completed') summary.completed_bookings += 1;
    if (['cancelled', 'refunded'].includes(booking.status)) summary.cancelled_bookings += 1;
    if (!revenueSet.has(booking.status)) continue;
    const gross = Number(booking.base_amount || 0);
    const net = Number(booking.net_owner_amount || 0);
    summary.gross_revenue += gross;
    summary.net_owner_earnings += net;
    const dateObj = new Date(`${date}T12:00:00Z`);
    const monday = new Date(dateObj);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    const monthKey = date.slice(0, 7);
    const addGroup = (map, key, includeGross) => {
      const row = map.get(key) || { period: key, booking_count: 0, gross_revenue: 0, net_owner_earnings: 0 };
      row.booking_count += 1;
      row.gross_revenue += gross;
      row.net_owner_earnings += net;
      map.set(key, row);
    };
    addGroup(dailyMap, date, true);
    addGroup(weeklyMap, weekKey, false);
    addGroup(monthlyMap, monthKey, false);
  }
  const bookedSlots = ownerSlots.filter((slot) => slot.status === 'booked').length;
  const availableSlots = ownerSlots.filter((slot) => slot.status === 'available').length;
  summary.booked_slots = bookedSlots;
  summary.available_slots = availableSlots;
  summary.utilization_rate = bookedSlots + availableSlots ? Number((bookedSlots * 100 / (bookedSlots + availableSlots)).toFixed(1)) : 0;
  const sortRows = (map) => [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
  return { summary, daily: sortRows(dailyMap), weekly: sortRows(weeklyMap), monthly: sortRows(monthlyMap) };
};

export const listOwnerCommissionSettings = async () => dbProvider === 'postgres'
  ? (await pool.query(`SELECT u.id AS user_id,u.name AS owner_name,u.email,op.business_name,op.approval_status,op.commission_override
      FROM users u JOIN turf_owner_profiles op ON op.user_id=u.id WHERE u.role='turf_owner' ORDER BY u.name`)).rows
  : await mongoDb.collection('users').aggregate([
      { $match: { role: 'turf_owner' } },
      { $lookup: { from: 'turf_owner_profiles', localField: 'id', foreignField: 'user_id', as: 'profile' } },
      { $unwind: '$profile' },
      { $project: { _id: 0, user_id: '$id', owner_name: '$name', email: 1, business_name: '$profile.business_name', approval_status: '$profile.approval_status', commission_override: '$profile.commission_override' } },
      { $sort: { owner_name: 1 } },
    ]).toArray();

export const setOwnerCommissionOverride = async ({ ownerId, commissionOverride, adminId }) => {
  if (commissionOverride !== null && (!Number.isFinite(Number(commissionOverride)) || Number(commissionOverride) < 0 || Number(commissionOverride) > 100)) throw new Error('Commission override must be between 0 and 100, or null to use the global rate.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query('SELECT commission_override FROM turf_owner_profiles WHERE user_id=$1 FOR UPDATE', [ownerId]);
      if (!prior.rowCount) { await client.query('ROLLBACK'); return null; }
      const updated = await client.query('UPDATE turf_owner_profiles SET commission_override=$2,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,commission_override', [ownerId, commissionOverride]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,before_value,after_value) VALUES ($1,'admin','owner_commission_updated','turf_owner',$2,$3::jsonb,$4::jsonb)", [adminId, ownerId, JSON.stringify({ commissionOverride: prior.rows[0].commission_override }), JSON.stringify({ commissionOverride: updated.rows[0].commission_override })]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const prior = await mongoDb.collection('turf_owner_profiles').findOne({ user_id: ownerId }, { session });
      if (!prior) return;
      const now = new Date().toISOString();
      await mongoDb.collection('turf_owner_profiles').updateOne({ user_id: ownerId }, { $set: { commission_override: commissionOverride, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'owner_commission_updated', entity_type: 'turf_owner', entity_id: ownerId, before_value: { commissionOverride: prior.commission_override ?? null }, after_value: { commissionOverride }, created_at: now }, { session });
      result = { user_id: ownerId, commission_override: commissionOverride };
    });
    return result;
  } finally { await session.endSession(); }
};

export const createReview = async ({ bookingId, playerId, rating, comment }) => {
  if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) throw new Error('Rating must be an integer from 1 through 5.');
  if (typeof comment !== 'string' || comment.length > 2000) throw new Error('Review comment cannot exceed 2,000 characters.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT b.id,b.turf_id,b.status,b.booking_date,b.end_time,t.name AS turf_name
        FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.id=$1 AND b.player_id=$2 FOR UPDATE OF b`, [bookingId, playerId]);
      const booking = found.rows[0];
      if (!booking || booking.status !== 'completed' || (await client.query(`SELECT ( ($1::date::timestamp + $2::time) AT TIME ZONE 'Asia/Dhaka') <= NOW() AS ended`, [booking.booking_date, booking.end_time])).rows[0].ended !== true) throw new Error('Only completed bookings whose end time has passed can be reviewed.');
      const inserted = await client.query('INSERT INTO reviews (booking_id,player_id,turf_id,rating,comment) VALUES ($1,$2,$3,$4,$5) RETURNING *', [bookingId, playerId, booking.turf_id, Number(rating), comment.trim() || null]);
      const aggregate = await client.query('SELECT AVG(rating)::numeric(3,2) AS rating,COUNT(*)::int AS review_count FROM reviews WHERE turf_id=$1', [booking.turf_id]);
      await client.query('UPDATE turfs SET rating=$2,review_count=$3,updated_at=NOW() WHERE id=$1', [booking.turf_id, aggregate.rows[0].rating, aggregate.rows[0].review_count]);
      const user = await client.query('SELECT name FROM users WHERE id=$1', [playerId]);
      await client.query('COMMIT');
      return { ...inserted.rows[0], player_name: user.rows[0]?.name, turf_name: booking.turf_name, turf_rating: Number(aggregate.rows[0].rating), review_count: Number(aggregate.rows[0].review_count) };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, player_id: playerId }, { session });
      const turf = booking && await mongoDb.collection('turfs').findOne({ id: booking.turf_id }, { session });
      const bookingDate = booking?.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking?.booking_date || '').slice(0, 10);
      const endTime = String(booking?.end_time || '').slice(0, 8);
      const timeMatch = endTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
      let endsAt = new Date(Number.NaN);
      if (timeMatch) {
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2]);
        const second = Number(timeMatch[3] || 0);
        if (hour <= 24 && minute <= 59 && second <= 59 && (hour !== 24 || (minute === 0 && second === 0))) {
          let endDate = bookingDate;
          const normalizedHour = hour === 24 ? '00' : String(hour).padStart(2, '0');
          if (hour === 24) {
            const [year, month, day] = bookingDate.split('-').map(Number);
            const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
            endDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
          }
          endsAt = new Date(`${endDate}T${normalizedHour}:${timeMatch[2]}:${String(second).padStart(2, '0')}+06:00`);
        }
      }
      if (!booking || !turf || booking.status !== 'completed' || !Number.isFinite(endsAt.getTime()) || endsAt.getTime() > Date.now()) throw new Error('Only completed bookings whose end time has passed can be reviewed.');
      const record = { id: crypto.randomUUID(), booking_id: bookingId, player_id: playerId, turf_id: booking.turf_id, rating: Number(rating), comment: comment.trim() || null, created_at: new Date().toISOString() };
      await mongoDb.collection('reviews').insertOne(record, { session });
      const stats = await mongoDb.collection('reviews').aggregate([{ $match: { turf_id: booking.turf_id } }, { $group: { _id: null, rating: { $avg: '$rating' }, review_count: { $sum: 1 } } }], { session }).next();
      await mongoDb.collection('turfs').updateOne({ id: booking.turf_id }, { $set: { rating: Number(stats?.rating || 0), review_count: Number(stats?.review_count || 0), updated_at: new Date().toISOString() } }, { session });
      const player = await mongoDb.collection('users').findOne({ id: playerId }, { projection: { name: 1 }, session });
      result = { ...record, player_name: player?.name, turf_name: turf.name, turf_rating: Number(stats?.rating || 0), review_count: Number(stats?.review_count || 0) };
    });
    return result;
  } finally { await session.endSession(); }
};

export const listTurfReviews = async (turfId) => dbProvider === 'postgres'
  ? (await pool.query('SELECT r.id,r.booking_id,r.player_id,u.name AS player_name,r.turf_id,r.rating,r.comment,r.created_at FROM reviews r JOIN users u ON u.id=r.player_id JOIN turfs t ON t.id=r.turf_id WHERE r.turf_id=$1 AND t.status=\'active\' ORDER BY r.created_at DESC LIMIT 100', [turfId])).rows
  : await mongoDb.collection('reviews').aggregate([
    { $match: { turf_id: turfId } }, { $lookup: { from: 'users', localField: 'player_id', foreignField: 'id', as: 'player' } },
    { $unwind: '$player' }, { $lookup: { from: 'turfs', localField: 'turf_id', foreignField: 'id', as: 'turf' } }, { $unwind: '$turf' },
    { $match: { 'turf.status': 'active' } }, { $project: { player: 0, turf: 0 } }, { $sort: { created_at: -1 } }, { $limit: 100 },
  ]).toArray();

export const createDispute = async ({ bookingId, userId, reason, description }) => {
  const record = { id: crypto.randomUUID(), booking_id: bookingId, raised_by: userId, reason, description: description || null, status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `INSERT INTO disputes (booking_id,raised_by,reason,description,status) VALUES ($1,$2,$3,$4,'open') RETURNING *`,
      [bookingId, userId, reason, description || null]
    );
    return result.rows[0];
  }
  await mongoDb.collection('disputes').insertOne(record);
  return record;
};

export const listAdminDisputes = async () => dbProvider === 'postgres'
  ? (await pool.query('SELECT d.*,b.booking_number,u.name AS raised_by_name FROM disputes d JOIN bookings b ON b.id=d.booking_id JOIN users u ON u.id=d.raised_by ORDER BY d.created_at DESC')).rows
  : mongoDb.collection('disputes').find({}).sort({ created_at: -1 }).toArray();

export const resolveDispute = async ({ disputeId, adminId, status, resolution }) => {
  if (!['investigating', 'resolved', 'closed'].includes(status)) throw new Error('Invalid dispute status.');
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `UPDATE disputes SET status=$2,resolution=$3,resolved_by=CASE WHEN $2 IN ('resolved','closed') THEN $4 ELSE resolved_by END,
       resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN NOW() ELSE resolved_at END,updated_at=NOW()
       WHERE id=$1 AND status IN ('open','investigating') RETURNING *`, [disputeId, status, resolution || null, adminId]
    );
    return result.rows[0] || null;
  }
  const now = new Date().toISOString();
  const result = await mongoDb.collection('disputes').findOneAndUpdate({ id: disputeId, status: { $in: ['open', 'investigating'] } }, { $set: { status, resolution: resolution || null, resolved_by: ['resolved', 'closed'].includes(status) ? adminId : null, resolved_at: ['resolved', 'closed'].includes(status) ? now : null, updated_at: now } }, { returnDocument: 'after' });
  return result;
};

export const listCancellationPolicies = async () => {
  if (dbProvider === 'postgres') {
    return (await pool.query(
      `SELECT p.*,COALESCE((SELECT json_agg(t ORDER BY t.sort_order) FROM cancellation_policy_tiers t WHERE t.policy_id=p.id),'[]'::json) AS tiers,
       (SELECT COUNT(*)::int FROM turf_cancellation_policies a WHERE a.policy_id=p.id) AS assigned_turfs,
       (SELECT COUNT(*)::int FROM owner_cancellation_policies a WHERE a.policy_id=p.id) AS assigned_owners
       FROM cancellation_policies p ORDER BY p.is_default DESC,p.name`
    )).rows;
  }
  const policies = await mongoDb.collection('cancellation_policies').find({}).sort({ is_default: -1, name: 1 }).toArray();
  return Promise.all(policies.map(async (policy) => {
    const [tiers, assigned_turfs, assigned_owners] = await Promise.all([
      mongoDb.collection('cancellation_policy_tiers').find({ policy_id: policy.id }).sort({ sort_order: 1 }).toArray(),
      mongoDb.collection('turf_cancellation_policies').countDocuments({ policy_id: policy.id }),
      mongoDb.collection('owner_cancellation_policies').countDocuments({ policy_id: policy.id }),
    ]);
    return { ...policy, tiers, assigned_turfs, assigned_owners };
  }));
};

export const saveCancellationPolicy = async ({ id, name, description, isDefault, tiers, adminId }) => {
  const policyId = id || crypto.randomUUID();
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = id ? await client.query('SELECT * FROM cancellation_policies WHERE id=$1 FOR UPDATE', [id]) : { rows: [] };
      if (id && !prior.rowCount) throw new Error('Cancellation policy not found.');
      if (prior.rows[0]?.is_default && !isDefault) throw new Error('The system default policy cannot be unset.');
      if (isDefault) await client.query('UPDATE cancellation_policies SET is_default=FALSE WHERE is_default=TRUE AND id<>$1', [policyId]);
      if (prior.rowCount) await client.query('UPDATE cancellation_policies SET name=$2,description=$3,is_default=$4,is_active=TRUE,updated_at=NOW() WHERE id=$1', [policyId, name, description || null, isDefault]);
      else await client.query('INSERT INTO cancellation_policies (id,name,description,is_default,is_active,created_by) VALUES ($1,$2,$3,$4,TRUE,$5)', [policyId, name, description || null, isDefault, adminId]);
      await client.query('DELETE FROM cancellation_policy_tiers WHERE policy_id=$1', [policyId]);
      for (const [sortOrder, tier] of tiers.entries()) await client.query('INSERT INTO cancellation_policy_tiers (policy_id,hours_before_start_min,hours_before_start_max,refund_percentage,sort_order) VALUES ($1,$2,$3,$4,$5)', [policyId, tier.min, tier.max, tier.refundPercentage, sortOrder]);
      await client.query('INSERT INTO cancellation_policy_audit_logs (policy_id,action,actor_id,target_type,target_id,before_value,after_value) VALUES ($1,$2,$3,\'policy\',$1,$4::jsonb,$5::jsonb)', [policyId, id ? 'updated' : 'created', adminId, prior.rows[0] ? JSON.stringify(prior.rows[0]) : null, JSON.stringify({ name, description, isDefault, tiers })]);
      await client.query('COMMIT');
      return { id: policyId, name, description: description || null, is_default: isDefault, is_active: true, tiers };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const prior = id ? await mongoDb.collection('cancellation_policies').findOne({ id }) : null;
  if (id && !prior) throw new Error('Cancellation policy not found.');
  if (prior?.is_default && !isDefault) throw new Error('The system default policy cannot be unset.');
  if (isDefault) await mongoDb.collection('cancellation_policies').updateMany({ is_default: true, id: { $ne: policyId } }, { $set: { is_default: false, updated_at: now } });
  const policy = { id: policyId, name, description: description || null, is_default: isDefault, is_active: true, created_by: prior?.created_by || adminId, created_at: prior?.created_at || now, updated_at: now };
  await mongoDb.collection('cancellation_policies').replaceOne({ id: policyId }, policy, { upsert: true });
  await mongoDb.collection('cancellation_policy_tiers').deleteMany({ policy_id: policyId });
  if (tiers.length) await mongoDb.collection('cancellation_policy_tiers').insertMany(tiers.map((tier, sort_order) => ({ id: crypto.randomUUID(), policy_id: policyId, hours_before_start_min: tier.min, hours_before_start_max: tier.max, refund_percentage: tier.refundPercentage, sort_order })));
  await mongoDb.collection('cancellation_policy_audit_logs').insertOne({ id: crypto.randomUUID(), policy_id: policyId, action: id ? 'updated' : 'created', actor_id: adminId, target_type: 'policy', target_id: policyId, before_value: prior || null, after_value: { ...policy, tiers }, created_at: now });
  return { ...policy, tiers };
};

export const assignCancellationPolicy = async ({ targetType, targetId, policyId, adminId, remove = false }) => {
  const table = targetType === 'turf' ? 'turf_cancellation_policies' : 'owner_cancellation_policies';
  const key = targetType === 'turf' ? 'turf_id' : 'owner_id';
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query(`SELECT * FROM ${table} WHERE ${key}=$1 FOR UPDATE`, [targetId]);
      if (remove) await client.query(`DELETE FROM ${table} WHERE ${key}=$1`, [targetId]);
      else {
        const targetTable = targetType === 'turf' ? 'turfs' : 'users';
        const target = await client.query(`SELECT id FROM ${targetTable} WHERE id=$1 AND ${targetType === 'owner' ? "role='turf_owner'" : 'TRUE'}`, [targetId]);
        if (!target.rowCount) throw new Error(`${targetType} not found.`);
        const policy = await client.query('SELECT id FROM cancellation_policies WHERE id=$1 AND is_active=TRUE', [policyId]);
        if (!policy.rowCount) throw new Error('Active cancellation policy not found.');
        await client.query(`INSERT INTO ${table} (${key},policy_id,assigned_by,assigned_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (${key}) DO UPDATE SET policy_id=EXCLUDED.policy_id,assigned_by=EXCLUDED.assigned_by,assigned_at=NOW()`, [targetId, policyId, adminId]);
      }
      await client.query('INSERT INTO cancellation_policy_audit_logs (policy_id,action,actor_id,target_type,target_id,before_value,after_value) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)', [policyId || prior.rows[0]?.policy_id || null, remove ? 'unassigned' : `assigned_${targetType}`, adminId, targetType, targetId, prior.rows[0] ? JSON.stringify(prior.rows[0]) : null, remove ? null : JSON.stringify({ policy_id: policyId })]);
      await client.query('COMMIT');
      return { targetType, targetId, policyId: remove ? null : policyId };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const prior = await mongoDb.collection(table).findOne({ [key]: targetId });
  if (!remove) {
    const target = targetType === 'turf' ? await mongoDb.collection('turfs').findOne({ id: targetId }) : await mongoDb.collection('users').findOne({ id: targetId, role: 'turf_owner' });
    const policy = await mongoDb.collection('cancellation_policies').findOne({ id: policyId, is_active: true });
    if (!target) throw new Error(`${targetType} not found.`);
    if (!policy) throw new Error('Active cancellation policy not found.');
    await mongoDb.collection(table).updateOne({ [key]: targetId }, { $set: { policy_id: policyId, assigned_by: adminId, assigned_at: now } }, { upsert: true });
  } else await mongoDb.collection(table).deleteOne({ [key]: targetId });
  await mongoDb.collection('cancellation_policy_audit_logs').insertOne({ id: crypto.randomUUID(), policy_id: policyId || prior?.policy_id || null, action: remove ? 'unassigned' : `assigned_${targetType}`, actor_id: adminId, target_type: targetType, target_id: targetId, before_value: prior || null, after_value: remove ? null : { policy_id: policyId }, created_at: now });
  return { targetType, targetId, policyId: remove ? null : policyId };
};

export const deleteCancellationPolicy = async ({ policyId, adminId }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const policy = await client.query('SELECT * FROM cancellation_policies WHERE id=$1 FOR UPDATE', [policyId]);
      if (!policy.rowCount) { await client.query('ROLLBACK'); return false; }
      const used = await client.query('SELECT EXISTS(SELECT 1 FROM turf_cancellation_policies WHERE policy_id=$1) OR EXISTS(SELECT 1 FROM owner_cancellation_policies WHERE policy_id=$1) AS used', [policyId]);
      if (policy.rows[0].is_default || used.rows[0].used) throw new Error('Default or assigned cancellation policies cannot be deleted.');
      await client.query('INSERT INTO cancellation_policy_audit_logs (policy_id,action,actor_id,target_type,target_id,before_value) VALUES ($1,\'deleted\',$2,\'policy\',$1,$3::jsonb)', [policyId, adminId, JSON.stringify(policy.rows[0])]);
      await client.query('DELETE FROM cancellation_policies WHERE id=$1', [policyId]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const policy = await mongoDb.collection('cancellation_policies').findOne({ id: policyId });
  if (!policy) return false;
  if (policy.is_default || await mongoDb.collection('turf_cancellation_policies').countDocuments({ policy_id: policyId }) || await mongoDb.collection('owner_cancellation_policies').countDocuments({ policy_id: policyId })) throw new Error('Default or assigned cancellation policies cannot be deleted.');
  const now = new Date().toISOString();
  await mongoDb.collection('cancellation_policy_audit_logs').insertOne({ id: crypto.randomUUID(), policy_id: policyId, action: 'deleted', actor_id: adminId, target_type: 'policy', target_id: policyId, before_value: policy, created_at: now });
  await mongoDb.collection('cancellation_policy_tiers').deleteMany({ policy_id: policyId });
  await mongoDb.collection('cancellation_policies').deleteOne({ id: policyId });
  return true;
};

export const resolveCancellationRefundPercentage = async ({ turfId, ownerId, hoursSinceBooking }) => {
  if (!Number.isFinite(hoursSinceBooking) || hoursSinceBooking < 0) throw new Error('Cancellation time must be a valid number of hours since the booking was created.');
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT tier.refund_percentage FROM cancellation_policy_tiers tier
       JOIN cancellation_policies policy ON policy.id=tier.policy_id AND policy.is_active=TRUE
       WHERE tier.policy_id=COALESCE(
         (SELECT policy_id FROM turf_cancellation_policies WHERE turf_id=$1),
         (SELECT policy_id FROM owner_cancellation_policies WHERE owner_id=$2),
         (SELECT id FROM cancellation_policies WHERE is_default=TRUE AND is_active=TRUE LIMIT 1))
       AND tier.hours_before_start_min <= $3
       AND (tier.hours_before_start_max IS NULL OR $3 < tier.hours_before_start_max
         OR ($3=24 AND tier.hours_before_start_min=6 AND tier.hours_before_start_max=24))
       ORDER BY tier.sort_order LIMIT 1`, [turfId, ownerId, hoursSinceBooking]
    );
    return result.rows[0] ? Number(result.rows[0].refund_percentage) : hoursSinceBooking < 6 ? 70 : hoursSinceBooking <= 24 ? 50 : 0;
  }
  const [turfPolicy, ownerPolicy, defaultPolicy] = await Promise.all([
    mongoDb.collection('turf_cancellation_policies').findOne({ turf_id: turfId }),
    mongoDb.collection('owner_cancellation_policies').findOne({ owner_id: ownerId }),
    mongoDb.collection('cancellation_policies').findOne({ is_default: true, is_active: true }),
  ]);
  const policyId = turfPolicy?.policy_id || ownerPolicy?.policy_id || defaultPolicy?.id;
  const tiers = policyId ? await mongoDb.collection('cancellation_policy_tiers').find({ policy_id: policyId }).sort({ sort_order: 1 }).toArray() : [];
  const tier = tiers.find((item) => hoursSinceBooking >= Number(item.hours_before_start_min) &&
    (item.hours_before_start_max == null || hoursSinceBooking < Number(item.hours_before_start_max) ||
      (hoursSinceBooking === 24 && Number(item.hours_before_start_min) === 6 && Number(item.hours_before_start_max) === 24)));
  return tier ? Number(tier.refund_percentage) : hoursSinceBooking < 6 ? 70 : hoursSinceBooking <= 24 ? 50 : 0;
};

export const createPlayerCancellationRequest = async ({ bookingId, playerId, reason, refundPercentage }) => {
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query(`UPDATE bookings SET cancellation_request_status='pending',cancellation_request_reason=$3,
      cancellation_requested_at=NOW(),cancellation_request_refund_percentage=$4,cancellation_decision_reason=NULL,
      cancellation_decided_at=NULL,updated_at=NOW() WHERE id=$1 AND player_id=$2 AND status IN ('confirmed','checked_in')
      AND cancellation_request_status IS DISTINCT FROM 'pending' RETURNING id,cancellation_requested_at`,
    [bookingId, playerId, reason, refundPercentage]);
    if (!result.rowCount) throw new Error('Only active bookings can have one pending cancellation request.');
    return { bookingId, status: 'pending', requestedAt: result.rows[0].cancellation_requested_at, refundPercentage };
  }
  const result = await mongoDb.collection('bookings').updateOne({ id: bookingId, player_id: playerId,
    status: { $in: ['confirmed','checked_in'] }, cancellation_request_status: { $ne: 'pending' } },
  { $set: { cancellation_request_status: 'pending', cancellation_request_reason: reason, cancellation_requested_at: now,
    cancellation_request_refund_percentage: refundPercentage, cancellation_decision_reason: null, cancellation_decided_at: null, updated_at: now } });
  if (!result.modifiedCount) throw new Error('Only active bookings can have one pending cancellation request.');
  return { bookingId, status: 'pending', requestedAt: now, refundPercentage };
};

export const listExpiredCancellationRequests = async () => dbProvider === 'postgres'
  ? (await pool.query(`SELECT b.id AS booking_id,b.player_id,b.cancellation_request_refund_percentage AS refund_percentage,
      t.owner_id FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.cancellation_request_status='pending'
      AND b.cancellation_requested_at <= NOW() - INTERVAL '24 hours' AND b.status IN ('confirmed','checked_in') LIMIT 100`)).rows
  : await Promise.all((await mongoDb.collection('bookings').find({ cancellation_request_status: 'pending',
      cancellation_requested_at: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }, status: { $in: ['confirmed','checked_in'] } }).limit(100).toArray())
      .map(async (booking) => ({ booking_id: booking.id, player_id: booking.player_id,
        refund_percentage: booking.cancellation_request_refund_percentage,
        owner_id: (await mongoDb.collection('turfs').findOne({ id: booking.turf_id }))?.owner_id })));

export const recordCancellationRequestDecision = async ({ bookingId, ownerId, decision, reason }) => {
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query(`UPDATE bookings b SET cancellation_request_status=$3,cancellation_decision_reason=$4,
      cancellation_decided_at=NOW(),updated_at=NOW() FROM turfs t WHERE b.id=$1 AND t.id=b.turf_id AND t.owner_id=$2
      AND b.cancellation_request_status='pending' AND (($3='approved' AND b.status='cancelled') OR ($3='rejected' AND b.status IN ('confirmed','checked_in'))) RETURNING b.player_id`,
    [bookingId, ownerId, decision, reason]);
    if (!result.rowCount) throw new Error('Pending cancellation request not found for this owner.');
    return { playerId: result.rows[0].player_id, decision, reason };
  }
  const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, cancellation_request_status: 'pending',
    status: decision === 'approved' ? 'cancelled' : { $in: ['confirmed','checked_in'] } });
  const turf = booking && await mongoDb.collection('turfs').findOne({ id: booking.turf_id, owner_id: ownerId });
  if (!booking || !turf) throw new Error('Pending cancellation request not found for this owner.');
  const result = await mongoDb.collection('bookings').updateOne({ id: bookingId, cancellation_request_status: 'pending' },
    { $set: { cancellation_request_status: decision, cancellation_decision_reason: reason, cancellation_decided_at: now, updated_at: now } });
  if (!result.modifiedCount) throw new Error('Cancellation request was already resolved.');
  return { playerId: booking.player_id, decision, reason };
};

const cancellationRemainderHoldDescription = 'Cancellation remainder held until booking start';

export const cancelBookingAndQueueRefund = async ({ bookingId, actorId, reason, refundPercentage, ownerInitiated = false, adminOverride = false, actorRole, refundInitiator }) => {
  const now = new Date().toISOString();
  const effectiveActorRole = actorRole || (adminOverride ? 'admin' : ownerInitiated ? 'turf_owner' : 'player');
  const effectiveRefundInitiator = refundInitiator || (adminOverride ? 'admin' : ownerInitiated ? 'owner' : 'player');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT b.*,t.owner_id FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.id=$1 FOR UPDATE OF b', [bookingId]);
      const booking = found.rows[0];
      if (!booking || !['confirmed', 'checked_in'].includes(booking.status)) throw new Error('Only confirmed bookings can be cancelled.');
      const isManual = booking.booking_source !== 'online';
      let amount;
      let turfRefund;
      if (ownerInitiated || adminOverride) {
        amount = isManual ? Number(booking.total_payable) : Number(booking.total_payable) - Number(booking.gateway_fee_amount || 0);
        turfRefund = Number(booking.base_amount);
      } else if (isManual) {
        amount = Math.max(0, (Number(booking.base_amount) + Number(booking.platform_fee_amount)) * refundPercentage / 100 - Number(booking.platform_fee_amount));
        turfRefund = Number(booking.base_amount) * refundPercentage / 100;
      } else {
        amount = Number(booking.base_amount) * refundPercentage / 100;
        turfRefund = amount;
      }
      const manual = isManual ? await client.query('SELECT payment_status,payment_amount FROM manual_bookings WHERE booking_id=$1', [bookingId]) : null;
      if (manual) {
        if (!['paid', 'partial'].includes(manual.rows[0]?.payment_status)) amount = 0;
        else amount = Math.min(amount, Number(manual.rows[0].payment_amount || 0));
      }
      amount = Math.round(Math.max(0, amount) * 100) / 100;
      const refundStatus = amount > 0 ? 'pending' : 'not_required';
      const paymentStatus = amount > 0 ? 'refund_pending' : isManual ? (manual.rows[0]?.payment_status || 'pending') : 'paid';
      await client.query("UPDATE bookings SET status='cancelled',payment_status=$2,cancelled_by=$3,cancellation_reason=$4,updated_at=NOW() WHERE id=$1", [bookingId, paymentStatus, actorId, reason]);
      await client.query("UPDATE slots SET status='available',locked_until=NULL,locked_by_user_id=NULL,updated_at=NOW() WHERE id IN (SELECT slot_id FROM booking_slots WHERE booking_id=$1) AND status IN ('booked','locked')", [bookingId]);
      if (amount > 0) await client.query(
        `INSERT INTO refunds (booking_id,amount,turf_price_refunded,platform_fee_refunded,gateway_fee_refunded,booking_source,reason,initiated_by,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [bookingId, amount, turfRefund, ownerInitiated ? booking.platform_fee_amount : 0, 0, booking.booking_source, reason, effectiveRefundInitiator]
      );
      if (!isManual) {
        const net = Number(booking.net_owner_amount || 0);
        const ownerKeeps = ownerInitiated || adminOverride ? 0 : Math.max(0, net - turfRefund);
        const alreadyReleased = (await client.query('SELECT 1 FROM wallet_transactions WHERE idempotency_key=$1', [`booking-hold-release:${bookingId}`])).rowCount > 0;
        if (alreadyReleased) {
          await client.query('UPDATE wallets SET available_balance=available_balance-$2+$3,updated_at=NOW() WHERE owner_id=$1', [booking.owner_id, net, ownerKeeps]);
        } else {
          const amountRemovedFromOwnerEarnings = Math.max(0, net - ownerKeeps);
          await client.query('UPDATE wallets SET held_balance=GREATEST(0,held_balance-$2),updated_at=NOW() WHERE owner_id=$1', [booking.owner_id, amountRemovedFromOwnerEarnings]);
          await client.query(
            `INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description)
             VALUES ($1,$2,'hold',$3,$4,$5)
             ON CONFLICT (idempotency_key) DO UPDATE SET amount=EXCLUDED.amount,description=EXCLUDED.description`,
            [booking.owner_id, bookingId, ownerKeeps, `booking-hold:${bookingId}`, cancellationRemainderHoldDescription]
          );
        }
        if (net > ownerKeeps) await client.query("INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description) VALUES ($1,$2,'refund_debit',$3,$4,'Booking cancellation reduced owner earnings') ON CONFLICT (idempotency_key) DO NOTHING", [booking.owner_id, bookingId, net - ownerKeeps, `booking-refund-debit:${bookingId}`]);
        if (alreadyReleased && ownerKeeps > 0) await client.query("INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description) VALUES ($1,$2,'release',$3,$4,'Unrefunded booking earnings retained after cancellation') ON CONFLICT (idempotency_key) DO NOTHING", [booking.owner_id, bookingId, ownerKeeps, `booking-hold-release:${bookingId}`]);
      }
      await client.query('INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,after_value) VALUES ($1,$2,$3,\'booking\',$4,$5,$6::jsonb)', [actorId, effectiveActorRole, adminOverride ? 'admin_force_refund' : 'booking_cancelled', bookingId, reason, JSON.stringify({ refundAmount: amount, refundStatus, refundPercentage })]);
      if (adminOverride) await client.query("INSERT INTO cancellation_policy_audit_logs (action,actor_id,target_type,target_id,after_value) VALUES ('admin_override',$1,'booking',$2,$3::jsonb)", [actorId, bookingId, JSON.stringify({ refundAmount: amount, reason })]);
      await client.query('COMMIT');
      return { bookingId, status: 'cancelled', refundAmount: amount, refundStatus };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, status: { $in: ['confirmed', 'checked_in'] } }, { session });
      if (!booking) throw new Error('Only confirmed bookings can be cancelled.');
      const turf = await mongoDb.collection('turfs').findOne({ id: booking.turf_id }, { session });
      const isManual = booking.booking_source !== 'online';
      let manualPaymentStatus = null;
      let amount = ownerInitiated || adminOverride
        ? isManual ? Number(booking.total_payable) : Number(booking.total_payable) - Number(booking.gateway_fee_amount || 0)
        : isManual ? Math.max(0, (Number(booking.base_amount) + Number(booking.platform_fee_amount)) * refundPercentage / 100 - Number(booking.platform_fee_amount))
          : Number(booking.base_amount) * refundPercentage / 100;
      const turfRefund = ownerInitiated || adminOverride ? Number(booking.base_amount) : Number(booking.base_amount) * refundPercentage / 100;
      if (isManual) {
        const manual = await mongoDb.collection('manual_bookings').findOne({ booking_id: bookingId }, { session });
        manualPaymentStatus = manual?.payment_status || 'pending';
        amount = ['paid', 'partial'].includes(manual?.payment_status) ? Math.min(amount, Number(manual.payment_amount || 0)) : 0;
      }
      amount = Math.round(Math.max(0, amount) * 100) / 100;
      const status = amount > 0 ? 'pending' : 'not_required';
      const paymentStatus = amount > 0 ? 'refund_pending' : isManual ? manualPaymentStatus : 'paid';
      const updated = await mongoDb.collection('bookings').updateOne({ id: bookingId, status: { $in: ['confirmed', 'checked_in'] } }, { $set: { status: 'cancelled', payment_status: paymentStatus, cancelled_by: actorId, cancellation_reason: reason, updated_at: now } }, { session });
      if (!updated.modifiedCount) throw new Error('Booking state changed; reload and try again.');
      const linked = await mongoDb.collection('booking_slots').find({ booking_id: bookingId }, { session }).toArray();
      await mongoDb.collection('slots').updateMany({ id: { $in: linked.map((entry) => entry.slot_id) }, status: { $in: ['booked', 'locked'] } }, { $set: { status: 'available', locked_until: null, locked_by_user_id: null } }, { session });
      if (amount > 0) await mongoDb.collection('refunds').insertOne({ id: crypto.randomUUID(), booking_id: bookingId, amount, turf_price_refunded: turfRefund, platform_fee_refunded: ownerInitiated ? booking.platform_fee_amount : 0, gateway_fee_refunded: 0, booking_source: booking.booking_source, reason, initiated_by: effectiveRefundInitiator, status: 'pending', created_at: now }, { session });
      if (!isManual && turf?.owner_id) {
        const net = Number(booking.net_owner_amount || 0);
        const ownerKeeps = ownerInitiated || adminOverride ? 0 : Math.max(0, net - turfRefund);
        const alreadyReleased = Boolean(await mongoDb.collection('wallet_transactions').findOne({ idempotency_key: `booking-hold-release:${bookingId}` }, { session }));
        const amountRemovedFromOwnerEarnings = Math.max(0, net - ownerKeeps);
        const walletUpdate = alreadyReleased
          ? { $inc: { available_balance: ownerKeeps - net }, $set: { updated_at: now } }
          : { $inc: { held_balance: -Math.min(Number((await mongoDb.collection('wallets').findOne({ owner_id: turf.owner_id }, { session }))?.held_balance || 0), amountRemovedFromOwnerEarnings) }, $set: { updated_at: now } };
        await mongoDb.collection('wallets').updateOne({ owner_id: turf.owner_id }, walletUpdate, { session });
        if (!alreadyReleased) await mongoDb.collection('wallet_transactions').updateOne(
          { idempotency_key: `booking-hold:${bookingId}` },
          { $set: { amount: ownerKeeps, description: cancellationRemainderHoldDescription } },
          { session }
        );
        if (net > ownerKeeps) await mongoDb.collection('wallet_transactions').insertOne({ id: crypto.randomUUID(), owner_id: turf.owner_id, booking_id: bookingId, transaction_type: 'refund_debit', amount: net - ownerKeeps, idempotency_key: `booking-refund-debit:${bookingId}`, description: 'Booking cancellation reduced owner earnings', created_at: now }, { session });
        if (ownerKeeps > 0 && alreadyReleased) await mongoDb.collection('wallet_transactions').insertOne({ id: crypto.randomUUID(), owner_id: turf.owner_id, booking_id: bookingId, transaction_type: 'release', amount: ownerKeeps, idempotency_key: `booking-hold-release:${bookingId}`, description: 'Unrefunded booking earnings retained after cancellation', created_at: now }, { session });
      }
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: actorId, actor_role: effectiveActorRole, action: adminOverride ? 'admin_force_refund' : 'booking_cancelled', entity_type: 'booking', entity_id: bookingId, reason, after_value: { refundAmount: amount, refundStatus: status, refundPercentage }, created_at: now }, { session });
      if (adminOverride) await mongoDb.collection('cancellation_policy_audit_logs').insertOne({ id: crypto.randomUUID(), action: 'admin_override', actor_id: actorId, target_type: 'booking', target_id: bookingId, after_value: { refundAmount: amount, reason }, created_at: now }, { session });
      output = { bookingId, status: 'cancelled', refundAmount: amount, refundStatus: status };
    });
    return output;
  } finally { await session.endSession(); }
};

export const listPendingRefunds = async () => {
  if (dbProvider === 'postgres') return (await pool.query(
    `SELECT r.*,b.booking_number,b.player_id,u.name AS player_name,t.name AS turf_name,t.owner_id,
       p.gateway AS payment_gateway,
       (r.booking_source='online' AND (
         (p.gateway='sslcommerz' AND NULLIF(p.gateway_response->>'bank_tran_id','') IS NOT NULL) OR
         (p.gateway='uddoktapay' AND NULLIF(p.gateway_response->>'transaction_id','') IS NOT NULL
          AND NULLIF(p.gateway_response->>'payment_method','') IS NOT NULL
          AND COALESCE((uddokta.value->>'isActive')::boolean,FALSE)
          AND uddokta.value ? 'apiKeyEncrypted'
          AND COALESCE((uddokta.value->>'automatedRefundsEnabled')::boolean,FALSE))
       )) AS gateway_supported
     FROM refunds r JOIN bookings b ON b.id=r.booking_id LEFT JOIN users u ON u.id=b.player_id JOIN turfs t ON t.id=b.turf_id
     LEFT JOIN payments p ON p.booking_id=b.id LEFT JOIN platform_settings uddokta ON uddokta.key='uddoktapay_config'
     WHERE r.status IN ('pending','processing') ORDER BY r.created_at`
  )).rows;
  const refunds = await mongoDb.collection('refunds').find({ status: { $in: ['pending', 'processing'] } }).sort({ created_at: 1 }).toArray();
  const uddoktapayConfig = await readPaymentGatewayConfigRecord('uddoktapay');
  return Promise.all(refunds.map(async (refund) => {
    const booking = await mongoDb.collection('bookings').findOne({ id: refund.booking_id });
    const [player, turf] = await Promise.all([
      booking?.player_id ? mongoDb.collection('users').findOne({ id: booking.player_id }) : null,
      booking ? mongoDb.collection('turfs').findOne({ id: booking.turf_id }) : null,
    ]);
    const payment = booking && await mongoDb.collection('payments').findOne({ booking_id: booking.id });
    const gatewaySupported = refund.booking_source === 'online' && (
      payment?.gateway === 'sslcommerz' && Boolean(payment?.gateway_response?.bank_tran_id) ||
      payment?.gateway === 'uddoktapay' && Boolean(uddoktapayConfig?.isActive && uddoktapayConfig?.apiKeyEncrypted && uddoktapayConfig?.automatedRefundsEnabled && payment?.gateway_response?.transaction_id && payment?.gateway_response?.payment_method)
    );
    return { ...refund, payment_gateway: payment?.gateway, gateway_supported: gatewaySupported, booking_number: booking?.booking_number, player_id: booking?.player_id, player_name: player?.name, turf_name: turf?.name, owner_id: turf?.owner_id };
  }));
};

export const claimRefundForGateway = async ({ refundId, adminId, requestId, gateway = 'sslcommerz' }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT r.*,b.booking_source,p.gateway,p.gateway_response,p.transaction_id FROM refunds r
        JOIN bookings b ON b.id=r.booking_id LEFT JOIN payments p ON p.booking_id=b.id WHERE r.id=$1 FOR UPDATE OF r`, [refundId]);
      const refund = found.rows[0];
      if (!refund || !['pending', 'processing'].includes(refund.status)) throw new Error('Pending gateway refund was not found.');
      if (refund.booking_source !== 'online' || refund.gateway !== gateway) throw new Error('Refund must be processed by the original online payment provider.');
      let bankTransactionId = null;
      if (gateway === 'sslcommerz') {
        bankTransactionId = refund.gateway_response?.bank_tran_id;
        if (!bankTransactionId) throw new Error('A validated SSLCommerz bank transaction ID is unavailable; process this refund manually.');
      } else if (gateway === 'uddoktapay') {
        const config = await readPaymentGatewayConfigRecord('uddoktapay');
        if (!config?.isActive || !config?.apiKeyEncrypted || !config?.automatedRefundsEnabled || !refund.gateway_response?.transaction_id || !refund.gateway_response?.payment_method) throw new Error('UddoktaPay automated refunds are not enabled or verified payment details are unavailable.');
        if (refund.status === 'processing' && refund.gateway_request_id === requestId) throw new Error('UddoktaPay refund is already processing; verify it in UddoktaPay before retrying.');
      } else throw new Error('Automated refunds are not supported for this payment provider.');
      if (refund.gateway_request_id && refund.gateway_request_id !== requestId) throw new Error('A different gateway refund request is already registered.');
      await client.query("UPDATE refunds SET status='processing',gateway_request_id=$2,gateway_error=NULL WHERE id=$1", [refundId, requestId]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,'admin',$2,'refund',$3,$4::jsonb)", [adminId, `${gateway}_refund_claimed`, refundId, JSON.stringify({ requestId, amount: refund.amount })]);
      await client.query('COMMIT');
      return { ...refund, gateway_request_id: requestId, status: 'processing', bank_tran_id: bankTransactionId, provider_transaction_id: refund.gateway_response?.transaction_id, payment_method: refund.gateway_response?.payment_method };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let output;
    await session.withTransaction(async () => {
      const refund = await mongoDb.collection('refunds').findOne({ id: refundId, status: { $in: ['pending', 'processing'] } }, { session });
      if (!refund) throw new Error('Pending gateway refund was not found.');
      if (refund.booking_source !== 'online') throw new Error('Manual bookings must use the existing manual refund workflow.');
      const payment = await mongoDb.collection('payments').findOne({ booking_id: refund.booking_id }, { session });
      if (payment?.gateway !== gateway) throw new Error('Refund must be processed by the original online payment provider.');
      let bankTransactionId = null;
      if (gateway === 'sslcommerz') {
        bankTransactionId = payment?.gateway_response?.bank_tran_id;
        if (!bankTransactionId) throw new Error('A validated SSLCommerz bank transaction ID is unavailable; process this refund manually.');
      } else if (gateway === 'uddoktapay') {
        const config = await readPaymentGatewayConfigRecord('uddoktapay');
        if (!config?.isActive || !config?.apiKeyEncrypted || !config?.automatedRefundsEnabled || !payment?.gateway_response?.transaction_id || !payment?.gateway_response?.payment_method) throw new Error('UddoktaPay automated refunds are not enabled or verified payment details are unavailable.');
        if (refund.status === 'processing' && refund.gateway_request_id === requestId) throw new Error('UddoktaPay refund is already processing; verify it in UddoktaPay before retrying.');
      } else throw new Error('Automated refunds are not supported for this payment provider.');
      if (refund.gateway_request_id && refund.gateway_request_id !== requestId) throw new Error('A different gateway refund request is already registered.');
      const now = new Date().toISOString();
      await mongoDb.collection('refunds').updateOne({ id: refundId }, { $set: { status: 'processing', gateway_request_id: requestId, gateway_error: null, updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: `${gateway}_refund_claimed`, entity_type: 'refund', entity_id: refundId, after_value: { requestId, amount: refund.amount }, created_at: now }, { session });
      output = { ...refund, gateway_request_id: requestId, status: 'processing', bank_tran_id: bankTransactionId, transaction_id: payment?.transaction_id, provider_transaction_id: payment?.gateway_response?.transaction_id, payment_method: payment?.gateway_response?.payment_method };
    });
    return output;
  } finally { await session.endSession(); }
};

export const saveGatewayRefundResponse = async ({ refundId, requestId, refundReference, error, submitted = false }) => {
  const message = String(error || '').slice(0, 500);
  if (dbProvider === 'postgres') {
    const result = await pool.query(`UPDATE refunds SET status=CASE WHEN $5::boolean THEN 'processing' WHEN $3::text IS NULL THEN 'pending' ELSE 'processing' END,
      gateway_refund_ref=COALESCE($3,gateway_refund_ref),gateway_error=$4,updated_at=NOW()
      WHERE id=$1 AND gateway_request_id=$2 AND status='processing' RETURNING *`, [refundId, requestId, refundReference || null, message || null, submitted]);
    if (!result.rowCount) throw new Error('Gateway refund request state changed; refresh the refund queue.');
    return result.rows[0];
  }
  const status = submitted || refundReference ? 'processing' : 'pending';
  const result = await mongoDb.collection('refunds').findOneAndUpdate({ id: refundId, gateway_request_id: requestId, status: 'processing' }, { $set: { status, gateway_refund_ref: refundReference || undefined, gateway_error: message || null, updated_at: new Date().toISOString() } }, { returnDocument: 'after' });
  if (!result) throw new Error('Gateway refund request state changed; refresh the refund queue.');
  return result;
};

export const completeGatewayRefund = async ({ refundId, adminId, refundReference }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM refunds WHERE id=$1 AND status=\'processing\' FOR UPDATE', [refundId]);
      const refund = found.rows[0];
      if (!refund || !refundReference || refund.gateway_refund_ref !== refundReference) throw new Error('Processing gateway refund was not found.');
      const sums = await client.query("SELECT COALESCE(SUM(amount),0) AS refunded FROM refunds WHERE booking_id=$1 AND status='processed'", [refund.booking_id]);
      const fullyRefunded = Number(sums.rows[0].refunded) + Number(refund.amount) >= Number((await client.query('SELECT total_payable FROM bookings WHERE id=$1', [refund.booking_id])).rows[0].total_payable) - 0.01;
      await client.query("UPDATE refunds SET status='processed',gateway_error=NULL,processed_at=NOW() WHERE id=$1", [refundId]);
      await client.query('UPDATE bookings SET payment_status=$2,updated_at=NOW() WHERE id=$1', [refund.booking_id, fullyRefunded ? 'refunded' : 'partially_refunded']);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,after_value) VALUES ($1,'admin','sslcommerz_refund_completed','refund',$2,$3,$4::jsonb)", [adminId, refundId, refundReference, JSON.stringify({ amount: refund.amount })]);
      await client.query('COMMIT');
      return { ...refund, status: 'processed', gateway_refund_ref: refundReference };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const refund = await mongoDb.collection('refunds').findOne({ id: refundId, status: 'processing', gateway_refund_ref: refundReference }, { session });
      if (!refund || !refundReference) throw new Error('Processing gateway refund was not found.');
      const booking = await mongoDb.collection('bookings').findOne({ id: refund.booking_id }, { session });
      const processed = await mongoDb.collection('refunds').aggregate([{ $match: { booking_id: refund.booking_id, status: 'processed' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }], { session }).next();
      const fullyRefunded = Number(processed?.amount || 0) + Number(refund.amount) >= Number(booking.total_payable) - 0.01;
      const now = new Date().toISOString();
      await mongoDb.collection('refunds').updateOne({ id: refundId, status: 'processing' }, { $set: { status: 'processed', gateway_error: null, processed_at: now, updated_at: now } }, { session });
      await mongoDb.collection('bookings').updateOne({ id: refund.booking_id }, { $set: { payment_status: fullyRefunded ? 'refunded' : 'partially_refunded', updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'sslcommerz_refund_completed', entity_type: 'refund', entity_id: refundId, reason: refundReference, after_value: { amount: refund.amount }, created_at: now }, { session });
      result = { ...refund, status: 'processed', gateway_refund_ref: refundReference };
    });
    return result;
  } finally { await session.endSession(); }
};

export const markRefundProcessed = async ({ refundId, adminId, reference }) => {
  if (!reference || reference.length > 255) throw new Error('A refund processing reference is required.');
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const refund = await client.query(`SELECT r.*,b.booking_source,p.gateway,p.gateway_response FROM refunds r
        JOIN bookings b ON b.id=r.booking_id LEFT JOIN payments p ON p.booking_id=b.id WHERE r.id=$1 FOR UPDATE OF r`, [refundId]);
      const row = refund.rows[0];
      const canConfirmSubmittedUddoktaRefund = row?.status === 'processing' && row.gateway === 'uddoktapay' && Boolean(row.gateway_request_id);
      if (!row || (row.status !== 'pending' && !canConfirmSubmittedUddoktaRefund)) throw new Error('Pending refund not found.');
      if (row.booking_source === 'online' && row.gateway === 'sslcommerz' && row.gateway_response?.bank_tran_id) throw new Error('This online refund has a supported SSLCommerz transaction; use its gateway refund action.');
      await client.query("UPDATE refunds SET status='processed',gateway_refund_ref=$2,processed_at=NOW() WHERE id=$1", [refundId, reference]);
      const sums = await client.query("SELECT COALESCE(SUM(amount),0) AS refunded FROM refunds WHERE booking_id=$1 AND status='processed'", [row.booking_id]);
      const bookingInfo = await client.query('SELECT total_payable FROM bookings WHERE id=$1', [row.booking_id]);
      const fullyRefunded = Number(sums.rows[0].refunded) >= Number(bookingInfo.rows[0].total_payable) - 0.01;
      await client.query('UPDATE bookings SET payment_status=$2,updated_at=NOW() WHERE id=$1', [row.booking_id, fullyRefunded ? 'refunded' : 'partially_refunded']);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,after_value) VALUES ($1,'admin','refund_processed','refund',$2,$3,$4::jsonb)", [adminId, refundId, reference, JSON.stringify({ amount: refund.rows[0].amount })]);
      await client.query('COMMIT');
      return { ...row, status: 'processed', gateway_refund_ref: reference };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let processed;
    await session.withTransaction(async () => {
      const refund = await mongoDb.collection('refunds').findOne({ id: refundId, status: 'pending' }, { session });
      const [booking, payment] = await Promise.all([
        refund ? mongoDb.collection('bookings').findOne({ id: refund.booking_id }, { session }) : null,
        refund ? mongoDb.collection('payments').findOne({ booking_id: refund.booking_id }, { session }) : null,
      ]);
      const canConfirmSubmittedUddoktaRefund = refund?.status === 'processing' && payment?.gateway === 'uddoktapay' && Boolean(refund.gateway_request_id);
      if (!refund || (refund.status !== 'pending' && !canConfirmSubmittedUddoktaRefund)) throw new Error('Pending refund not found.');
      if (booking?.booking_source === 'online' && payment?.gateway === 'sslcommerz' && payment?.gateway_response?.bank_tran_id) throw new Error('This online refund has a supported SSLCommerz transaction; use its gateway refund action.');
      const now = new Date().toISOString();
      await mongoDb.collection('refunds').updateOne({ id: refundId, status: 'pending' }, { $set: { status: 'processed', gateway_refund_ref: reference, processed_at: now } }, { session });
      const sums = await mongoDb.collection('refunds').aggregate([{ $match: { booking_id: refund.booking_id, status: 'processed' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }], { session }).next();
      await mongoDb.collection('bookings').updateOne({ id: refund.booking_id }, { $set: { payment_status: Number(sums?.amount || 0) >= Number(booking.total_payable) - 0.01 ? 'refunded' : 'partially_refunded', updated_at: now } }, { session });
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'refund_processed', entity_type: 'refund', entity_id: refundId, reason: reference, after_value: { amount: refund.amount }, created_at: new Date().toISOString() }, { session });
      processed = { ...refund, status: 'processed', gateway_refund_ref: reference };
    });
    return processed;
  } finally { await session.endSession(); }
};

export const releaseMaturedWalletHolds = async () => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const mature = await client.query(
        `SELECT hold.owner_id,hold.booking_id,hold.amount FROM wallet_transactions hold
         JOIN bookings b ON b.id=hold.booking_id
         WHERE hold.transaction_type='hold' AND hold.amount>0
           AND (b.status IN ('confirmed','checked_in','completed')
             OR (b.status='cancelled' AND hold.description=$1))
           AND ((b.booking_date::text||' '||b.start_time::text)::timestamp AT TIME ZONE 'Asia/Dhaka') <= NOW()
           AND NOT EXISTS (SELECT 1 FROM wallet_transactions release WHERE release.idempotency_key='booking-hold-release:'||b.id::text)
         ORDER BY b.booking_date,b.start_time LIMIT 500 FOR UPDATE OF b SKIP LOCKED`, [cancellationRemainderHoldDescription]
      );
      for (const hold of mature.rows) {
        const amount = Number(hold.amount);
        await client.query('UPDATE wallets SET held_balance=GREATEST(0,held_balance-$2),available_balance=available_balance+$2,updated_at=NOW() WHERE owner_id=$1', [hold.owner_id, amount]);
        await client.query("INSERT INTO wallet_transactions (owner_id,booking_id,transaction_type,amount,idempotency_key,description) VALUES ($1,$2,'release',$3,$4,'Cancellation hold matured at booking start') ON CONFLICT (idempotency_key) DO NOTHING", [hold.owner_id, hold.booking_id, amount, `booking-hold-release:${hold.booking_id}`]);
      }
      await client.query('COMMIT');
      return mature.rowCount;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let released = 0;
    await session.withTransaction(async () => {
      const holds = await mongoDb.collection('wallet_transactions').find({ transaction_type: 'hold', amount: { $gt: 0 } }, { session }).sort({ created_at: 1 }).limit(1000).toArray();
      for (const hold of holds) {
        const bookingFilter = { id: hold.booking_id, status: { $in: ['confirmed', 'checked_in', 'completed', 'cancelled'] } };
        const booking = await mongoDb.collection('bookings').findOne(bookingFilter, { session });
        if (!booking) continue;
        if (booking.status === 'cancelled' && hold.description !== cancellationRemainderHoldDescription) continue;
        const date = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date).slice(0, 10);
        const start = new Date(`${date}T${String(booking.start_time).slice(0, 8)}+06:00`);
        if (start.getTime() > Date.now()) continue;
        const key = `booking-hold-release:${booking.id}`;
        if (await mongoDb.collection('wallet_transactions').findOne({ idempotency_key: key }, { session })) continue;
        const amount = Number(hold.amount);
        await mongoDb.collection('wallets').updateOne({ owner_id: hold.owner_id }, { $inc: { held_balance: -amount, available_balance: amount }, $set: { updated_at: new Date().toISOString() } }, { session });
        await mongoDb.collection('wallet_transactions').insertOne({ id: crypto.randomUUID(), owner_id: hold.owner_id, booking_id: booking.id, transaction_type: 'release', amount, idempotency_key: key, description: 'Cancellation hold matured at booking start', created_at: new Date().toISOString() }, { session });
        released += 1;
      }
    });
    return released;
  } finally { await session.endSession(); }
};

export const completeEndedBookings = async () => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ended = await client.query(
        `SELECT id,status FROM bookings
         WHERE status IN ('confirmed','checked_in') AND payment_status='paid' AND cancellation_request_status IS DISTINCT FROM 'pending'
           AND ((booking_date + end_time) AT TIME ZONE 'Asia/Dhaka') <= NOW()
         ORDER BY booking_date,end_time LIMIT 500 FOR UPDATE SKIP LOCKED`
      );
      for (const booking of ended.rows) {
        const changed = await client.query("UPDATE bookings SET status='completed',updated_at=NOW() WHERE id=$1 AND status=ANY($2::text[])", [booking.id, ['confirmed', 'checked_in']]);
        if (changed.rowCount) await client.query(
          "INSERT INTO audit_logs (actor_role,action,entity_type,entity_id,before_value,after_value) VALUES ('system','booking_auto_completed','booking',$1,$2::jsonb,$3::jsonb)",
          [booking.id, JSON.stringify({ status: booking.status }), JSON.stringify({ status: 'completed', reason: 'scheduled_end_time_passed' })]
        );
      }
      await client.query('COMMIT');
      return ended.rowCount;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  const now = new Date();
  const due = await mongoDb.collection('bookings').find({ status: { $in: ['confirmed', 'checked_in'] }, payment_status: 'paid', cancellation_request_status: { $ne: 'pending' } }).sort({ booking_date: 1, end_time: 1 }).limit(500).toArray();
  let completed = 0;
  for (const booking of due) {
    const date = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date || '').slice(0, 10);
    const time = String(booking.end_time || '').slice(0, 8).padEnd(8, '0');
    let endDate = date;
    let normalizedTime = time;
    if (time.startsWith('24:00')) {
      const [year, month, day] = date.split('-').map(Number);
      const next = new Date(Date.UTC(year, month - 1, day + 1));
      endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      normalizedTime = `00:${time.slice(3)}`;
    }
    const endsAt = new Date(`${endDate}T${normalizedTime}+06:00`);
    if (!Number.isFinite(endsAt.getTime()) || endsAt > now) continue;
    const updatedAt = now.toISOString();
    const result = await mongoDb.collection('bookings').updateOne(
      { id: booking.id, status: { $in: ['confirmed', 'checked_in'] }, payment_status: 'paid', cancellation_request_status: { $ne: 'pending' } },
      { $set: { status: 'completed', updated_at: updatedAt } }
    );
    if (!result.modifiedCount) continue;
    await mongoDb.collection('audit_logs').insertOne({
      id: crypto.randomUUID(), actor_role: 'system', action: 'booking_auto_completed', entity_type: 'booking', entity_id: booking.id,
      before_value: { status: booking.status }, after_value: { status: 'completed', reason: 'scheduled_end_time_passed' }, created_at: updatedAt,
    });
    completed += 1;
  }
  return completed;
};

export const getBookingForUser = async (bookingId, user) => {
  if (dbProvider === 'postgres') {
    const values = [bookingId];
    let scope = '';
    if (user.role === 'player') { values.push(user.id); scope = 'AND b.player_id=$2'; }
    else if (user.role === 'turf_owner') { values.push(user.id); scope = 'AND t.owner_id=$2'; }
    else if (user.role === 'staff') {
      values.push(user.id);
      values.push(JSON.stringify(['bookings.view']));
      scope = 'AND EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.staff_user_id=$2 AND sa.turf_id=b.turf_id AND sa.status=\'active\' AND sa.permissions @> $3::jsonb)';
    }
    const result = await pool.query(
      `SELECT b.*, t.owner_id, t.name AS turf_name, p.gateway AS payment_gateway
       FROM bookings b JOIN turfs t ON t.id=b.turf_id LEFT JOIN payments p ON p.booking_id=b.id
       WHERE b.id=$1 ${scope} LIMIT 1`, values
    );
    return result.rows[0] || null;
  }
  const booking = await mongoDb.collection('bookings').findOne({ id: bookingId });
  if (!booking) return null;
  const [turf, payment] = await Promise.all([
    mongoDb.collection('turfs').findOne({ id: booking.turf_id }),
    mongoDb.collection('payments').findOne({ booking_id: bookingId }, { projection: { gateway: 1 } }),
  ]);
  if (user.role === 'player' && booking.player_id !== user.id) return null;
  if (user.role === 'turf_owner' && turf?.owner_id !== user.id) return null;
  if (user.role === 'staff' && !await mongoDb.collection('staff_assignments').findOne({ staff_user_id: user.id, turf_id: booking.turf_id, status: 'active', permissions: 'bookings.view' })) return null;
  return { ...booking, owner_id: turf?.owner_id, turf_name: turf?.name, payment_gateway: payment?.gateway };
};

export const listBookingsForStaff = async (staffId, { date = '', status = '' } = {}) => {
  if (dbProvider === 'postgres') {
    const values = [staffId];
    let filters = '';
    if (date) { values.push(date); filters += ` AND b.booking_date=$${values.length}`; }
    if (status) { values.push(status); filters += ` AND b.status=$${values.length}`; }
    return (await pool.query(
      `SELECT b.*,t.name AS turf_name,t.address,
       CASE WHEN EXISTS (SELECT 1 FROM staff_assignments sc WHERE sc.staff_user_id=$1 AND sc.turf_id=b.turf_id AND sc.status='active' AND sc.permissions @> '["bookings.view_player_contact"]'::jsonb) THEN mb.customer_name END AS customer_name,
       CASE WHEN EXISTS (SELECT 1 FROM staff_assignments sc WHERE sc.staff_user_id=$1 AND sc.turf_id=b.turf_id AND sc.status='active' AND sc.permissions @> '["bookings.view_player_contact"]'::jsonb) THEN mb.customer_phone END AS customer_phone FROM bookings b JOIN turfs t ON t.id=b.turf_id
       LEFT JOIN manual_bookings mb ON mb.booking_id=b.id
       WHERE EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.staff_user_id=$1 AND sa.turf_id=b.turf_id AND sa.status='active' AND sa.permissions @> '["bookings.view"]'::jsonb)${filters}
       ORDER BY b.booking_date,b.start_time LIMIT 250`, values
    )).rows;
  }
  const assignments = await mongoDb.collection('staff_assignments').find({ staff_user_id: staffId, status: 'active', permissions: 'bookings.view' }).toArray();
  const turfIds = assignments.map((item) => item.turf_id);
  const contactTurfIds = new Set(assignments.filter((item) => {
    const permissions = Array.isArray(item.permissions) ? item.permissions : [item.permissions];
    return permissions.includes('bookings.view_player_contact');
  }).map((item) => item.turf_id));
  const filter = { turf_id: { $in: turfIds } };
  if (date) filter.booking_date = date;
  if (status) filter.status = status;
  const bookings = await mongoDb.collection('bookings').find(filter).sort({ booking_date: 1, start_time: 1 }).limit(250).toArray();
  const turfs = await mongoDb.collection('turfs').find({ id: { $in: turfIds } }).toArray();
  const map = new Map(turfs.map((turf) => [turf.id, turf]));
  return Promise.all(bookings.map(async (booking) => {
    const manual = contactTurfIds.has(booking.turf_id)
      ? await mongoDb.collection('manual_bookings').findOne({ booking_id: booking.id }, { projection: { customer_name: 1, customer_phone: 1 } })
      : null;
    return { ...booking, turf_name: map.get(booking.turf_id)?.name, address: map.get(booking.turf_id)?.address, customer_name: manual?.customer_name, customer_phone: manual?.customer_phone };
  }));
};

export const listBookingsForOwner = async (ownerId, { date = '', status = '' } = {}) => {
  if (dbProvider === 'postgres') {
    const values = [ownerId];
    let filters = '';
    if (date) { values.push(date); filters += ` AND b.booking_date=$${values.length}`; }
    if (status) { values.push(status); filters += ` AND b.status=$${values.length}`; }
    return (await pool.query(
      `SELECT b.*,t.name AS turf_name,COALESCE(u.name,mb.customer_name) AS player_name,COALESCE(u.phone,mb.customer_phone) AS player_phone,payment.gateway AS payment_gateway
       FROM bookings b JOIN turfs t ON t.id=b.turf_id LEFT JOIN users u ON u.id=b.player_id LEFT JOIN manual_bookings mb ON mb.booking_id=b.id
       LEFT JOIN LATERAL (SELECT p.gateway FROM payments p WHERE p.booking_id=b.id ORDER BY (p.status='paid') DESC,p.created_at DESC LIMIT 1) payment ON TRUE
       WHERE t.owner_id=$1${filters} ORDER BY (b.cancellation_request_status='pending') DESC,b.booking_date DESC,b.start_time DESC LIMIT 500`, values
    )).rows;
  }
  const turfs = await mongoDb.collection('turfs').find({ owner_id: ownerId }, { projection: { id: 1, name: 1 } }).toArray();
  const turfMap = new Map(turfs.map((turf) => [turf.id, turf.name]));
  const filter = { turf_id: { $in: [...turfMap.keys()] } };
  if (date) filter.booking_date = date;
  if (status) filter.status = status;
  const pendingBookings = await mongoDb.collection('bookings').find({ ...filter, cancellation_request_status: 'pending' }).sort({ booking_date: -1, start_time: -1 }).toArray();
  const otherBookings = await mongoDb.collection('bookings').find({ ...filter, cancellation_request_status: { $ne: 'pending' } }).sort({ booking_date: -1, start_time: -1 }).limit(500).toArray();
  const bookings = [...pendingBookings, ...otherBookings];
  return Promise.all(bookings.map(async (booking) => {
    const player = booking.player_id ? await mongoDb.collection('users').findOne({ id: booking.player_id }, { projection: { name: 1, phone: 1 } }) : null;
    const manual = !booking.player_id ? await mongoDb.collection('manual_bookings').findOne({ booking_id: booking.id }, { projection: { customer_name: 1, customer_phone: 1 } }) : null;
    const payment = booking.booking_source === 'online' ? await mongoDb.collection('payments').findOne({ booking_id: booking.id }, { sort: { created_at: -1 }, projection: { gateway: 1 } }) : null;
    return { ...booking, turf_name: turfMap.get(booking.turf_id), player_name: player?.name || manual?.customer_name, player_phone: player?.phone || manual?.customer_phone, payment_gateway: payment?.gateway };
  }));
};

export const listBookingsForPlayer = async (playerId) => {
  if (dbProvider === 'postgres') return (await pool.query(
    `SELECT b.*,t.name AS turf_name,t.address,t.area,p.gateway AS payment_gateway,p.status AS gateway_payment_status
     FROM bookings b JOIN turfs t ON t.id=b.turf_id LEFT JOIN payments p ON p.booking_id=b.id
     WHERE b.player_id=$1 ORDER BY b.booking_date DESC,b.start_time DESC LIMIT 500`, [playerId]
  )).rows;
  const bookings = await mongoDb.collection('bookings').find({ player_id: playerId }).sort({ booking_date: -1, start_time: -1 }).limit(500).toArray();
  const turfIds = [...new Set(bookings.map((booking) => booking.turf_id))];
  const turfs = await mongoDb.collection('turfs').find({ id: { $in: turfIds } }).toArray();
  const turfMap = new Map(turfs.map((turf) => [turf.id, turf]));
  return Promise.all(bookings.map(async (booking) => {
    const payment = await mongoDb.collection('payments').findOne({ booking_id: booking.id });
    return { ...booking, turf_name: turfMap.get(booking.turf_id)?.name, address: turfMap.get(booking.turf_id)?.address, area: turfMap.get(booking.turf_id)?.area, payment_gateway: payment?.gateway, gateway_payment_status: payment?.status };
  }));
};

export const listBookingsForAdmin = async ({ dateFrom = '', dateTo = '', status = '', turfId = '', ownerId = '', playerId = '' } = {}) => {
  if (dbProvider === 'postgres') {
    const values = [];
    const filters = [];
    const add = (sql, value) => { values.push(value); filters.push(sql.replace('?', `$${values.length}`)); };
    if (dateFrom) add('b.booking_date >= ?::date', dateFrom);
    if (dateTo) add('b.booking_date <= ?::date', dateTo);
    if (status) add('b.status = ?', status);
    if (turfId) add('b.turf_id = ?::uuid', turfId);
    if (ownerId) add('t.owner_id = ?::uuid', ownerId);
    if (playerId) add('b.player_id = ?::uuid', playerId);
    const result = await pool.query(
      `SELECT b.*,t.name AS turf_name,t.owner_id,u.name AS player_name,u.email AS player_email,u.phone AS player_phone,
        COALESCE(mb.customer_name,u.name) AS customer_name,COALESCE(mb.customer_phone,u.phone) AS customer_phone
       FROM bookings b JOIN turfs t ON t.id=b.turf_id LEFT JOIN users u ON u.id=b.player_id
       LEFT JOIN manual_bookings mb ON mb.booking_id=b.id ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY b.booking_date DESC,b.start_time DESC LIMIT 1000`, values
    );
    return result.rows;
  }
  const filter = {};
  if (dateFrom || dateTo) filter.booking_date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
  if (status) filter.status = status;
  if (turfId) filter.turf_id = turfId;
  if (playerId) filter.player_id = playerId;
  let bookings = await mongoDb.collection('bookings').find(filter).sort({ booking_date: -1, start_time: -1 }).limit(1000).toArray();
  if (ownerId) {
    const turfs = await mongoDb.collection('turfs').find({ owner_id: ownerId }, { projection: { id: 1 } }).toArray();
    const turfIds = new Set(turfs.map((turf) => turf.id));
    bookings = bookings.filter((booking) => turfIds.has(booking.turf_id));
  }
  const turfIds = [...new Set(bookings.map((booking) => booking.turf_id))];
  const userIds = [...new Set(bookings.map((booking) => booking.player_id).filter(Boolean))];
  const [turfs, users] = await Promise.all([
    mongoDb.collection('turfs').find({ id: { $in: turfIds } }).toArray(),
    mongoDb.collection('users').find({ id: { $in: userIds } }, { projection: { id: 1, name: 1, email: 1, phone: 1 } }).toArray(),
  ]);
  const turfMap = new Map(turfs.map((turf) => [turf.id, turf]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  return Promise.all(bookings.map(async (booking) => {
    const [manual, user] = await Promise.all([
      mongoDb.collection('manual_bookings').findOne({ booking_id: booking.id }, { projection: { customer_name: 1, customer_phone: 1 } }),
      Promise.resolve(userMap.get(booking.player_id)),
    ]);
    const turf = turfMap.get(booking.turf_id);
    return { ...booking, turf_name: turf?.name, owner_id: turf?.owner_id, player_name: user?.name, player_email: user?.email, player_phone: user?.phone, customer_name: manual?.customer_name || user?.name, customer_phone: manual?.customer_phone || user?.phone };
  }));
};

export const updateStaffBookingStatus = async ({ bookingId, staffId, status }) => {
  if (!['checked_in', 'completed'].includes(status)) throw new Error('Invalid staff booking status.');
  const previousStatuses = status === 'checked_in' ? ['confirmed'] : ['checked_in'];
  const permission = status === 'checked_in' ? 'bookings.check_in' : 'bookings.complete';
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE bookings b SET status=$3,updated_at=NOW() WHERE b.id=$1 AND b.status=ANY($4::text[])
         AND EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.staff_user_id=$2 AND sa.turf_id=b.turf_id AND sa.status='active' AND sa.permissions @> $5::jsonb) RETURNING b.*`,
        [bookingId, staffId, status, previousStatuses, JSON.stringify([permission])]
      );
      if (result.rowCount) await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,'staff',$2,'booking',$3,$4::jsonb)", [staffId, `booking_${status}`, bookingId, JSON.stringify({ status })]);
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, status: { $in: previousStatuses } });
  if (!booking || !await mongoDb.collection('staff_assignments').findOne({ staff_user_id: staffId, turf_id: booking.turf_id, status: 'active', permissions: permission })) return null;
  const updatedAt = new Date().toISOString();
  const changed = await mongoDb.collection('bookings').updateOne({ id: bookingId, status: { $in: previousStatuses } }, { $set: { status, updated_at: updatedAt } });
  if (!changed.modifiedCount) return null;
  await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: staffId, actor_role: 'staff', action: `booking_${status}`, entity_type: 'booking', entity_id: bookingId, after_value: { status }, created_at: updatedAt });
  return { ...booking, status, updated_at: updatedAt };
};

export const updateOwnerBookingStatus = async ({ bookingId, ownerId, status }) => {
  if (!['checked_in', 'completed'].includes(status)) throw new Error('Invalid owner booking status.');
  const previousStatuses = status === 'checked_in' ? ['confirmed'] : ['confirmed', 'checked_in'];
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const booking = await client.query('SELECT b.* FROM bookings b JOIN turfs t ON t.id=b.turf_id WHERE b.id=$1 AND t.owner_id=$2 AND b.status=ANY($3::text[]) FOR UPDATE OF b', [bookingId, ownerId, previousStatuses]);
      if (!booking.rowCount) { await client.query('ROLLBACK'); return null; }
      const updated = await client.query('UPDATE bookings SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [bookingId, status]);
      await client.query("INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,'turf_owner',$2,'booking',$3,$4::jsonb)", [ownerId, `booking_${status}`, bookingId, JSON.stringify({ status })]);
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let updated = null;
    await session.withTransaction(async () => {
      const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, status: { $in: previousStatuses } }, { session });
      const turf = booking && await mongoDb.collection('turfs').findOne({ id: booking.turf_id, owner_id: ownerId }, { session });
      if (!booking || !turf) return;
      const now = new Date().toISOString();
      const result = await mongoDb.collection('bookings').updateOne({ id: bookingId, status: { $in: previousStatuses } }, { $set: { status, updated_at: now } }, { session });
      if (!result.modifiedCount) return;
      await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: `booking_${status}`, entity_type: 'booking', entity_id: bookingId, after_value: { status }, created_at: now }, { session });
      updated = { ...booking, status, updated_at: now };
    });
    return updated;
  } finally { await session.endSession(); }
};

export const updateOwnerTurf = async (ownerId, turfId, input) => {
  const fields = {
    name: input.name,
    description: input.description || '',
    address: input.address,
    area: input.area || '',
    city: input.city || '',
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    sport_types: input.sportTypes,
    amenities: input.amenities,
    base_price_per_hour: String(input.basePricePerHour),
    operating_hours: input.operatingHours,
    photos: input.photos.map((url, index) => ({ id: crypto.randomUUID(), url, sort_order: index })),
    pricing_rules: input.pricingRules,
  };
  if (dbProvider === 'mongodb') {
    const session = mongoClient.startSession();
    try {
      let updated = null;
      await session.withTransaction(async () => {
        const prior = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId }, { session });
        if (!prior) return;
        const updatedAt = new Date().toISOString();
        await mongoDb.collection('turfs').updateOne(
          { id: turfId, owner_id: ownerId },
          { $set: { ...fields, correction_message: null, updated_at: updatedAt } },
          { session }
        );
        if (prior.correction_message) {
          await mongoDb.collection('audit_logs').insertOne({
            id: crypto.randomUUID(), actor_id: ownerId, actor_role: 'turf_owner', action: 'turf_corrections_resubmitted',
            entity_type: 'turf', entity_id: turfId, reason: 'Owner resubmitted turf corrections.',
            before_value: { correctionMessage: prior.correction_message },
            after_value: { correctionMessage: null, status: prior.status }, created_at: updatedAt,
          }, { session });
        }
        updated = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId }, { session });
      });
      return updated;
    } finally { await session.endSession(); }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prior = await client.query(
      'SELECT id, status, correction_message FROM turfs WHERE id=$1 AND owner_id=$2 FOR UPDATE',
      [turfId, ownerId]
    );
    if (!prior.rowCount) { await client.query('ROLLBACK'); return null; }
    const result = await client.query(
      `UPDATE turfs SET name=$3, description=$4, address=$5, area=$6, city=$7,
        latitude=$8, longitude=$9, sport_types=$10, amenities=$11,
        base_price_per_hour=$12, operating_hours=$13, correction_message=NULL, updated_at=NOW()
       WHERE id=$1 AND owner_id=$2 RETURNING *`,
      [turfId, ownerId, fields.name, fields.description, fields.address, fields.area, fields.city,
        fields.latitude, fields.longitude, fields.sport_types, fields.amenities,
        fields.base_price_per_hour, JSON.stringify(fields.operating_hours)]
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
    if (prior.rows[0].correction_message) {
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value)
         VALUES ($1,'turf_owner','turf_corrections_resubmitted','turf',$2,'Owner resubmitted turf corrections.',$3::jsonb,$4::jsonb)`,
        [ownerId, turfId, JSON.stringify({ correctionMessage: prior.rows[0].correction_message }), JSON.stringify({ correctionMessage: null, status: prior.rows[0].status })]
      );
    }
    await client.query('DELETE FROM turf_photos WHERE turf_id=$1', [turfId]);
    await client.query('DELETE FROM turf_pricing_rules WHERE turf_id=$1', [turfId]);
    for (const [sortOrder, url] of input.photos.entries()) await client.query('INSERT INTO turf_photos (turf_id,url,sort_order) VALUES ($1,$2,$3)', [turfId, url, sortOrder]);
    for (const rule of input.pricingRules) await client.query('INSERT INTO turf_pricing_rules (turf_id,day_of_week,special_date,label,start_time,end_time,price_per_hour) VALUES ($1,$2,$3,$4,$5,$6,$7)', [turfId, rule.dayOfWeek ?? null, rule.date ?? null, rule.label, rule.startTime, rule.endTime, rule.pricePerHour]);
    await client.query('COMMIT');
    return { ...result.rows[0], photos: fields.photos, pricing_rules: fields.pricing_rules };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
};

export const listOwnerTurfAddons = async (ownerId, turfId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(`SELECT a.* FROM turf_addons a JOIN turfs t ON t.id=a.turf_id WHERE t.owner_id=$1 AND t.id=$2 ORDER BY a.display_order,a.created_at`, [ownerId, turfId]);
    return result.rows;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId });
  return turf ? await mongoDb.collection('turf_addons').find({ turf_id: turfId }).sort({ display_order: 1, created_at: 1 }).toArray() : null;
};

export const createOwnerTurfAddon = async (ownerId, turfId, input) => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const addon = { id, turf_id: turfId, name: input.name, description: input.description || '', category: input.category, price: input.price, stock_quantity: input.stockQuantity ?? null, is_active: input.isActive ?? true, display_order: input.displayOrder ?? 0, created_at: createdAt, updated_at: createdAt };
  if (dbProvider === 'postgres') {
    const result = await pool.query(`INSERT INTO turf_addons (id,turf_id,name,description,category,price,stock_quantity,is_active,display_order) SELECT $1,t.id,$3,$4,$5,$6,$7,$8,$9 FROM turfs t WHERE t.id=$2 AND t.owner_id=$10 RETURNING *`, [id,turfId,input.name,addon.description,input.category,input.price,addon.stock_quantity,addon.is_active,addon.display_order,ownerId]);
    return result.rows[0] || null;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId });
  if (!turf) return null;
  await mongoDb.collection('turf_addons').insertOne(addon);
  return addon;
};

export const updateOwnerTurfAddon = async (ownerId, turfId, addonId, input) => {
  const fields = { name: input.name, description: input.description || '', category: input.category, price: input.price, stock_quantity: input.stockQuantity ?? null, is_active: input.isActive ?? true, display_order: input.displayOrder ?? 0, updated_at: new Date().toISOString() };
  if (dbProvider === 'postgres') {
    const result = await pool.query(`UPDATE turf_addons a SET name=$4,description=$5,category=$6,price=$7,stock_quantity=$8,is_active=$9,display_order=$10,updated_at=NOW() FROM turfs t WHERE a.turf_id=t.id AND t.owner_id=$1 AND a.turf_id=$2 AND a.id=$3 RETURNING a.*`, [ownerId,turfId,addonId,fields.name,fields.description,fields.category,fields.price,fields.stock_quantity,fields.is_active,fields.display_order]);
    return result.rows[0] || null;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId });
  if (!turf) return null;
  const result = await mongoDb.collection('turf_addons').findOneAndUpdate({ id: addonId, turf_id: turfId }, { $set: fields }, { returnDocument: 'after' });
  return result;
};

export const deleteOwnerTurfAddon = async (ownerId, turfId, addonId) => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(`DELETE FROM turf_addons a USING turfs t WHERE a.turf_id=t.id AND t.owner_id=$1 AND a.turf_id=$2 AND a.id=$3 RETURNING a.id`, [ownerId,turfId,addonId]);
    return result.rowCount > 0;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId, owner_id: ownerId });
  if (!turf) return false;
  return (await mongoDb.collection('turf_addons').deleteOne({ id: addonId, turf_id: turfId })).deletedCount > 0;
};

export const listAvailability = async (turfId, date) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const turf = await client.query('SELECT operating_hours FROM turfs WHERE id=$1 AND status=\'active\'', [turfId]);
      if (!turf.rowCount) { await client.query('ROLLBACK'); return []; }
      await insertDailySlotsPostgres(client, turfId, date, turf.rows[0].operating_hours);
      const [result, activeBookings] = await Promise.all([
        client.query('SELECT id,turf_id,date,start_time,end_time,status FROM slots WHERE turf_id=$1 AND date=$2 ORDER BY start_time', [turfId, date]),
        client.query("SELECT start_time,end_time FROM bookings WHERE turf_id=$1 AND booking_date=$2 AND status IN ('confirmed','checked_in','completed')", [turfId, date]),
      ]);
      const configured = new Set(dailySlotTimes(date, turf.rows[0].operating_hours).map((slot) => slot.start_time));
      const available = result.rows.filter((slot) => configured.has(String(slot.start_time).slice(0, 5)) || slot.status !== 'available' ||
        activeBookings.rows.some((booking) => minutesOf(slot.start_time) < minutesOf(booking.end_time) && minutesOf(slot.end_time) > minutesOf(booking.start_time)))
        .map((slot) => activeBookings.rows.some((booking) => minutesOf(slot.start_time) < minutesOf(booking.end_time) && minutesOf(slot.end_time) > minutesOf(booking.start_time))
        ? { ...slot, status: 'booked', locked_until: null, locked_by_user_id: null }
        : slot);
      await client.query('COMMIT');
      return available;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId, status: 'active' });
  if (!turf) return [];
  await insertDailySlotsMongo(turfId, date, turf.operating_hours);
  const [slots, activeBookings] = await Promise.all([
    mongoDb.collection('slots').find({ turf_id: turfId, date }).sort({ start_time: 1 }).toArray(),
    mongoDb.collection('bookings').find({ turf_id: turfId, booking_date: date, status: { $in: ['confirmed', 'checked_in', 'completed'] } }, { projection: { start_time: 1, end_time: 1 } }).toArray(),
  ]);
  const configured = new Set(dailySlotTimes(date, turf.operating_hours).map((slot) => slot.start_time));
  return slots.filter((slot) => configured.has(String(slot.start_time).slice(0, 5)) || slot.status !== 'available' ||
    activeBookings.some((booking) => minutesOf(slot.start_time) < minutesOf(booking.end_time) && minutesOf(slot.end_time) > minutesOf(booking.start_time)))
    .map((slot) => activeBookings.some((booking) => minutesOf(slot.start_time) < minutesOf(booking.end_time) && minutesOf(slot.end_time) > minutesOf(booking.start_time))
    ? { ...slot, status: 'booked', locked_until: null, locked_by_user_id: null }
    : slot);
};

export const setSlotBlocked = async ({ turfId, date, startTime, blocked, actorId, actorRole }) => {
  const fromStatus = blocked ? 'available' : 'blocked';
  const toStatus = blocked ? 'blocked' : 'available';
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const turf = await client.query('SELECT owner_id FROM turfs WHERE id=$1 FOR SHARE', [turfId]);
      if (!turf.rowCount) { await client.query('ROLLBACK'); return null; }
      if (actorRole === 'turf_owner' && turf.rows[0].owner_id !== actorId) { await client.query('ROLLBACK'); return null; }
      if (actorRole === 'staff') {
        const permission = blocked ? 'slots.block' : 'slots.unblock';
        const assigned = await client.query("SELECT 1 FROM staff_assignments WHERE staff_user_id=$1 AND turf_id=$2 AND status='active' AND permissions @> $3::jsonb", [actorId, turfId, JSON.stringify([permission])]);
        if (!assigned.rowCount) { await client.query('ROLLBACK'); return null; }
      }
      const result = await client.query(
        `UPDATE slots SET status=$4,updated_at=NOW() WHERE turf_id=$1 AND date=$2 AND start_time=$3 AND status=$5 RETURNING *`,
        [turfId, date, startTime, toStatus, fromStatus]
      );
      if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
      await client.query('INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,after_value) VALUES ($1,$2,$3,\'slot\',$4,$5::jsonb)', [actorId, actorRole, blocked ? 'slot_blocked' : 'slot_unblocked', result.rows[0].id, JSON.stringify({ turfId, date, startTime, status: toStatus })]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: turfId });
  if (!turf || (actorRole === 'turf_owner' && turf.owner_id !== actorId)) return null;
  if (actorRole === 'staff') {
    const permission = blocked ? 'slots.block' : 'slots.unblock';
    if (!await mongoDb.collection('staff_assignments').findOne({ staff_user_id: actorId, turf_id: turfId, status: 'active', permissions: permission })) return null;
  }
  const result = await mongoDb.collection('slots').findOneAndUpdate(
    { turf_id: turfId, date, start_time: startTime, status: fromStatus },
    { $set: { status: toStatus, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  const slot = result?.value || result;
  if (!slot) return null;
  await mongoDb.collection('audit_logs').insertOne({ id: crypto.randomUUID(), actor_id: actorId, actor_role: actorRole, action: blocked ? 'slot_blocked' : 'slot_unblocked', entity_type: 'slot', entity_id: slot.id, after_value: { turfId, date, startTime, status: toStatus }, created_at: new Date().toISOString() });
  return slot;
};

export const listPendingTurfs = async () => {
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name FROM turfs t JOIN users u ON u.id=t.owner_id
       WHERE t.status='pending_review' ORDER BY t.created_at ASC`
    );
    return result.rows;
  }
  return mongoDb.collection('turfs').find({ status: 'pending_review' }).sort({ created_at: 1 }).toArray();
};

export const setTurfReviewStatus = async (turfId, status) => {
  if (!['active', 'inactive'].includes(status)) throw new Error('Invalid turf review status.');
  if (dbProvider === 'postgres') {
    const result = await pool.query(
      `UPDATE turfs SET status=$2, correction_message=NULL, updated_at=NOW()
       WHERE id=$1 AND status='pending_review' RETURNING *`,
      [turfId, status]
    );
    return result.rows[0] || null;
  }
  const result = await mongoDb.collection('turfs').findOneAndUpdate(
    { id: turfId, status: 'pending_review' },
    { $set: { status, correction_message: null, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  return result;
};

export const requestTurfCorrections = async ({ turfId, adminId, message }) => {
  const correctionMessage = String(message || '').trim();
  if (!correctionMessage || correctionMessage.length > 2000) throw new Error('Correction message must be between 1 and 2,000 characters.');
  const updatedAt = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query(
        `SELECT id,owner_id,name,correction_message FROM turfs
         WHERE id=$1 AND status='pending_review' AND deleted_at IS NULL FOR UPDATE`,
        [turfId]
      );
      if (!prior.rowCount) { await client.query('ROLLBACK'); return null; }
      const turf = prior.rows[0];
      await client.query(
        'UPDATE turfs SET correction_message=$2,updated_at=NOW() WHERE id=$1',
        [turfId, correctionMessage]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value)
         VALUES ($1,'admin','turf_correction_requested','turf',$2,$3,$4::jsonb,$5::jsonb)`,
        [adminId, turfId, correctionMessage, JSON.stringify({ correctionMessage: turf.correction_message || null }), JSON.stringify({ correctionMessage })]
      );
      await client.query('COMMIT');
      return { ...turf, correction_message: correctionMessage };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const turf = await mongoDb.collection('turfs').findOne(
        { id: turfId, status: 'pending_review', $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] },
        { session, projection: { id: 1, owner_id: 1, name: 1, correction_message: 1 } }
      );
      if (!turf) return;
      await mongoDb.collection('turfs').updateOne(
        { id: turfId, status: 'pending_review' },
        { $set: { correction_message: correctionMessage, updated_at: updatedAt } },
        { session }
      );
      await mongoDb.collection('audit_logs').insertOne({
        id: crypto.randomUUID(), actor_id: adminId, actor_role: 'admin', action: 'turf_correction_requested',
        entity_type: 'turf', entity_id: turfId, reason: correctionMessage,
        before_value: { correctionMessage: turf.correction_message || null },
        after_value: { correctionMessage }, created_at: updatedAt,
      }, { session });
      result = { ...turf, correction_message: correctionMessage };
    });
    return result;
  } finally { await session.endSession(); }
};

// Section 50 tournament persistence. Entry fees and prizes are descriptive only;
// these operations never write to payment or wallet tables.
const tournamentShape = (row) => row && ({
  id: row.id, turfId: row.turf_id, turfName: row.turf_name, organizerId: row.organizer_id,
  organizerName: row.organizer_name, name: row.name, sportType: row.sport_type, format: row.format || '',
  startDate: String(row.start_date).slice(0, 10), endDate: String(row.end_date).slice(0, 10),
  maxTeams: Number(row.max_teams), entryFeeAmount: row.entry_fee_amount == null ? undefined : Number(row.entry_fee_amount),
  teamSize: row.team_size == null ? undefined : Number(row.team_size),
  prizePoolNote: row.prize_pool_note || '', status: row.status, description: row.description || '', createdAt: row.created_at,
  reviewMessage: row.review_message || '', reviewRevision: Number(row.review_revision || 1),
});
const tournamentTeamShape = (row) => row && ({ id: row.id, tournamentId: row.tournament_id, captainId: row.captain_id,
  captainName: row.captain_name, captainPhone: row.captain_phone || '', teamName: row.team_name,
  rosterNotes: row.roster_notes || '', status: row.status, registeredAt: row.registered_at, rosterMembers: row.roster_members || [] });
const tournamentMatchShape = (row) => row && ({ id: row.id, tournamentId: row.tournament_id, roundName: row.round_name || '',
  teamAId: row.team_a_id || undefined, teamBId: row.team_b_id || undefined, teamAName: row.team_a_name || undefined,
  teamBName: row.team_b_name || undefined, scheduledDate: row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : '',
  scheduledStartTime: row.scheduled_start_time || '', scheduledEndTime: row.scheduled_end_time || '', slotId: row.slot_id || undefined,
  scoreA: row.score_a == null ? undefined : Number(row.score_a), scoreB: row.score_b == null ? undefined : Number(row.score_b),
  winnerTeamId: row.winner_team_id || undefined, status: row.status, createdAt: row.created_at });
const tournamentJoins = `SELECT t.*, tr.name AS turf_name, u.name AS organizer_name FROM tournaments t JOIN turfs tr ON tr.id=t.turf_id JOIN users u ON u.id=t.organizer_id`;
export const listTournaments = async ({ id, turfId, ownerId, status, sportType, area } = {}) => {
  if (dbProvider === 'postgres') {
    const values = []; const where = [];
    for (const [column, value] of [['t.id', id], ['t.turf_id', turfId], ['tr.owner_id', ownerId], ['t.status', status], ['t.sport_type', sportType]]) if (value) { values.push(value); where.push(`${column}=$${values.length}`); }
    if (area) { values.push(`%${area}%`); where.push(`(tr.area ILIKE $${values.length} OR tr.address ILIKE $${values.length} OR tr.city ILIKE $${values.length})`); }
    const rows = await pool.query(`${tournamentJoins} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.created_at DESC`, values);
    return rows.rows.map(tournamentShape);
  }
  const filter = {};
  if (id) filter.id = id; if (turfId) filter.turf_id = turfId; if (status) filter.status = status; if (sportType) filter.sport_type = sportType;
  let rows = await mongoDb.collection('tournaments').find(filter).sort({ created_at: -1 }).toArray();
  if (ownerId || area) {
    const turfIds = (await mongoDb.collection('turfs').find({ ...(ownerId ? { owner_id: ownerId } : {}), ...(area ? { $or: [{ area: { $regex: area, $options: 'i' } }, { address: { $regex: area, $options: 'i' } }, { city: { $regex: area, $options: 'i' } }] } : {}) }).project({ id: 1 }).toArray()).map((t) => t.id);
    rows = rows.filter((t) => turfIds.includes(t.turf_id));
  }
  const [turfs, users] = await Promise.all([mongoDb.collection('turfs').find({}).toArray(), mongoDb.collection('users').find({}).project({ id: 1, name: 1 }).toArray()]);
  const turfMap = new Map(turfs.map((t) => [t.id, t])); const userMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => tournamentShape({ ...r, turf_name: turfMap.get(r.turf_id)?.name || '', organizer_name: userMap.get(r.organizer_id)?.name || '' }));
};
export const listTournamentChildren = async (tournamentId) => {
  if (dbProvider === 'postgres') {
    const [teams, matches, members] = await Promise.all([
      pool.query(`SELECT tt.*,u.name AS captain_name,u.phone AS captain_phone FROM tournament_teams tt JOIN users u ON u.id=tt.captain_id WHERE tt.tournament_id=$1 ORDER BY tt.registered_at`, [tournamentId]),
      pool.query(`SELECT tm.*,a.team_name AS team_a_name,b.team_name AS team_b_name FROM tournament_matches tm LEFT JOIN tournament_teams a ON a.id=tm.team_a_id LEFT JOIN tournament_teams b ON b.id=tm.team_b_id WHERE tm.tournament_id=$1 ORDER BY tm.scheduled_date,tm.scheduled_start_time`, [tournamentId]),
      pool.query(`SELECT rm.*,u.name AS account_name FROM tournament_roster_members rm LEFT JOIN users u ON u.id=rm.player_id WHERE rm.tournament_id=$1 ORDER BY rm.created_at`, [tournamentId]),
    ]);
    const byTeam = new Map();
    for (const row of members.rows) {
      const list = byTeam.get(row.team_id) || [];
      list.push({ id:row.id, teamId:row.team_id, playerId:row.player_id || undefined, memberName:row.account_name || row.member_name, status:row.status, isManual:row.status === 'manual', createdAt:row.created_at, respondedAt:row.responded_at || undefined });
      byTeam.set(row.team_id,list);
    }
    return { teams: teams.rows.map((row) => tournamentTeamShape({ ...row, roster_members: byTeam.get(row.id) || [] })), matches: matches.rows.map(tournamentMatchShape) };
  }
  const teams = await mongoDb.collection('tournament_teams').find({ tournament_id: tournamentId }).sort({ registered_at: 1 }).toArray();
  const matches = await mongoDb.collection('tournament_matches').find({ tournament_id: tournamentId }).sort({ scheduled_date: 1, scheduled_start_time: 1 }).toArray();
  const members = await mongoDb.collection('tournament_roster_members').find({ tournament_id:tournamentId }).sort({ created_at:1 }).toArray();
  const users = await mongoDb.collection('users').find({ id: { $in: [...new Set([...teams.map((t) => t.captain_id),...members.map((m) => m.player_id).filter(Boolean)])] } }).toArray();
  const userMap = new Map(users.map((u) => [u.id, u])); const teamMap = new Map(teams.map((t) => [t.id, t]));
  const memberLists = new Map();
  for (const member of members) { const list = memberLists.get(member.team_id) || []; list.push({ id:member.id,teamId:member.team_id,playerId:member.player_id || undefined,memberName:userMap.get(member.player_id)?.name || member.member_name,status:member.status,isManual:member.status === 'manual',createdAt:member.created_at,respondedAt:member.responded_at || undefined }); memberLists.set(member.team_id,list); }
  return { teams: teams.map((t) => tournamentTeamShape({ ...t, captain_name: userMap.get(t.captain_id)?.name, captain_phone: userMap.get(t.captain_id)?.phone, roster_members:memberLists.get(t.id) || [] })),
    matches: matches.map((m) => tournamentMatchShape({ ...m, team_a_name: teamMap.get(m.team_a_id)?.team_name, team_b_name: teamMap.get(m.team_b_id)?.team_name })) };
};
export const createTournament = async (organizerId, input) => {
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query(`INSERT INTO tournaments(id,turf_id,organizer_id,name,sport_type,format,start_date,end_date,max_teams,entry_fee_amount,prize_pool_note,description,status,review_revision,team_size) SELECT $1,t.id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_review',1,$14 FROM turfs t WHERE t.id=$2 AND ($13::boolean OR t.owner_id=$3) AND t.deleted_at IS NULL RETURNING *`, [id,input.turfId,organizerId,input.name,input.sportType,input.format,input.startDate,input.endDate,input.maxTeams,input.entryFeeAmount ?? null,input.prizePoolNote || null,input.description || null, input.isAdmin === true,input.teamSize ?? null]);
    return result.rows[0] ? (await listTournaments({ id }))[0] : null;
  }
  const turf = await mongoDb.collection('turfs').findOne({ id: input.turfId, deleted_at: null });
  if (!turf || (input.isAdmin !== true && turf.owner_id !== organizerId)) return null;
  const row = { id, turf_id: input.turfId, organizer_id: organizerId, name: input.name, sport_type: input.sportType, format: input.format || '', start_date: input.startDate, end_date: input.endDate, max_teams: input.maxTeams, team_size:input.teamSize ?? null, entry_fee_amount: input.entryFeeAmount ?? null, prize_pool_note: input.prizePoolNote || null, description: input.description || '', status: 'pending_review', review_message: null, review_revision: 1, created_at: now, updated_at: now };
  await mongoDb.collection('tournaments').insertOne(row); return (await listTournaments({ id }))[0];
};
export const updateTournament = async (id, organizerId, input) => {
  const allowed = { name: 'name', sportType: 'sport_type', format: 'format', startDate: 'start_date', endDate: 'end_date', maxTeams: 'max_teams', entryFeeAmount: 'entry_fee_amount', prizePoolNote: 'prize_pool_note', description: 'description', status: 'status' };
  const fields = Object.entries(allowed).filter(([key]) => input[key] !== undefined);
  if (dbProvider === 'postgres') {
    const sets = fields.map(([key, column], i) => `${column}=$${i + 3}`); sets.push('updated_at=NOW()');
    await pool.query(`UPDATE tournaments t SET ${sets.join(',')} FROM turfs tr WHERE t.id=$1 AND t.turf_id=tr.id AND (t.organizer_id=$2 OR tr.owner_id=$2 OR $${fields.length + 3}::boolean)`, [id, organizerId, ...fields.map(([key]) => input[key]), input.isAdmin === true]);
  } else {
    const row = await mongoDb.collection('tournaments').findOne({ id }); const turf = row && await mongoDb.collection('turfs').findOne({ id: row.turf_id });
    if (!row || (!input.isAdmin && row.organizer_id !== organizerId && turf?.owner_id !== organizerId)) return null;
    await mongoDb.collection('tournaments').updateOne({ id }, { $set: { ...Object.fromEntries(fields.map(([key, col]) => [col, input[key]])), updated_at: new Date().toISOString() } });
  }
  return (await listTournaments({ id }))[0] || null;
};
export const decideTournamentReview = async ({ id, adminId, decision, message = '' }) => {
  const nextStatus = decision === 'approve' ? 'open' : 'changes_requested';
  const correction = decision === 'request_changes' ? message : null;
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query("UPDATE tournaments SET status=$2,review_message=$3,updated_at=NOW() WHERE id=$1 AND status='pending_review' RETURNING *", [id,nextStatus,correction]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
      await client.query('INSERT INTO audit_logs(actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value) VALUES($1,\'admin\',$2,\'tournament\',$3,$4,$5::jsonb,$6::jsonb)', [adminId,decision === 'approve' ? 'tournament_approved' : 'tournament_changes_requested',id,correction,JSON.stringify({status:'pending_review'}),JSON.stringify({status:nextStatus,reviewMessage:correction})]);
      await client.query('COMMIT'); return (await listTournaments({ id }))[0] || null;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const now = new Date().toISOString();
  const result = await mongoDb.collection('tournaments').findOneAndUpdate({id,status:'pending_review'},{$set:{status:nextStatus,review_message:correction,updated_at:now}},{returnDocument:'before'});
  const prior = result?.value || result; if (!prior) return null;
  await mongoDb.collection('audit_logs').insertOne({id:crypto.randomUUID(),actor_id:adminId,actor_role:'admin',action:decision === 'approve' ? 'tournament_approved' : 'tournament_changes_requested',entity_type:'tournament',entity_id:id,reason:correction,before_value:{status:prior.status},after_value:{status:nextStatus,reviewMessage:correction},created_at:now});
  return (await listTournaments({id}))[0] || null;
};

export const resubmitTournament = async ({ id, ownerId }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query("UPDATE tournaments t SET status='pending_review',review_message=NULL,review_revision=review_revision+1,updated_at=NOW() FROM turfs tr WHERE t.id=$1 AND t.turf_id=tr.id AND tr.owner_id=$2 AND t.status='changes_requested' RETURNING t.*",[id,ownerId]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
      await client.query('INSERT INTO audit_logs(actor_id,actor_role,action,entity_type,entity_id,before_value,after_value) VALUES($1,\'turf_owner\',\'tournament_resubmitted\',\'tournament\',$2,$3::jsonb,$4::jsonb)',[ownerId,id,JSON.stringify({status:'changes_requested'}),JSON.stringify({status:'pending_review',revision:result.rows[0].review_revision})]);
      await client.query('COMMIT'); return (await listTournaments({id}))[0] || null;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const tournament = await mongoDb.collection('tournaments').findOne({id,status:'changes_requested'});
  const turf = tournament && await mongoDb.collection('turfs').findOne({id:tournament.turf_id,owner_id:ownerId});
  if (!tournament || !turf) return null;
  const revision = Number(tournament.review_revision || 1) + 1; const now = new Date().toISOString();
  await mongoDb.collection('tournaments').updateOne({id,status:'changes_requested'},{$set:{status:'pending_review',review_message:null,review_revision:revision,updated_at:now}});
  await mongoDb.collection('audit_logs').insertOne({id:crypto.randomUUID(),actor_id:ownerId,actor_role:'turf_owner',action:'tournament_resubmitted',entity_type:'tournament',entity_id:id,before_value:{status:'changes_requested'},after_value:{status:'pending_review',revision},created_at:now});
  return (await listTournaments({id}))[0] || null;
};

export const searchTournamentPlayers = async (tournamentId, query) => {
  const term = String(query || '').trim(); if (term.length < 2) return [];
  if (dbProvider === 'postgres') {
    const rows = await pool.query(`SELECT u.id,u.name FROM users u WHERE u.role='player' AND u.status='active' AND u.name ILIKE $1 AND NOT EXISTS (SELECT 1 FROM tournament_teams tt WHERE tt.tournament_id=$2 AND tt.status IN ('pending_roster','registered') AND (tt.captain_id=u.id OR EXISTS (SELECT 1 FROM tournament_roster_members rm WHERE rm.team_id=tt.id AND rm.player_id=u.id AND rm.status IN ('pending','accepted')))) ORDER BY u.name LIMIT 10`, [`%${term}%`,tournamentId]);
    return rows.rows.map((row) => ({ id:row.id,name:row.name }));
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = await mongoDb.collection('tournament_teams').find({ tournament_id:tournamentId,status:{ $in:['pending_roster','registered'] } }).toArray();
  const existingMembers = await mongoDb.collection('tournament_roster_members').find({ tournament_id:tournamentId,status:{ $in:['pending','accepted'] },player_id:{ $ne:null } }).project({player_id:1}).toArray();
  const excluded = [...new Set([...existing.map((team) => team.captain_id),...existingMembers.map((member) => member.player_id)])];
  const rows = await mongoDb.collection('users').find({ role:'player',status:'active',name:{ $regex:escaped,$options:'i' },id:{ $nin:excluded } }).project({ id:1,name:1 }).sort({ name:1 }).limit(10).toArray();
  return rows.map(({ id,name }) => ({ id,name }));
};

export const registerTournamentTeam = async (tournamentId, captainId, teamName, rosterNotes, rosterMembers = []) => {
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tournamentResult = await client.query("SELECT * FROM tournaments WHERE id=$1 AND status='open' AND start_date>CURRENT_DATE FOR UPDATE", [tournamentId]);
      if (!tournamentResult.rowCount) { await client.query('ROLLBACK'); return null; }
      const tournament = tournamentResult.rows[0];
      const countResult = await client.query("SELECT COUNT(*)::int AS count FROM tournament_teams WHERE tournament_id=$1 AND status IN ('pending_roster','registered')", [tournamentId]);
      if (Number(countResult.rows[0].count) >= Number(tournament.max_teams)) { await client.query('ROLLBACK'); return null; }
      const size = tournament.team_size == null ? null : Number(tournament.team_size);
      if (size != null && rosterMembers.length !== size - 1) { await client.query('ROLLBACK'); return { rosterSizeError:size }; }
      const playerIds = rosterMembers.filter((member) => member.playerId).map((member) => member.playerId);
      if (new Set(playerIds).size !== playerIds.length || playerIds.includes(captainId)) { await client.query('ROLLBACK'); return { rosterConflict:true }; }
      const captainAlreadyRegistered = await client.query("SELECT 1 FROM tournament_teams WHERE tournament_id=$1 AND captain_id=$2 AND status IN ('pending_roster','registered') LIMIT 1",[tournamentId,captainId]);
      if (captainAlreadyRegistered.rowCount) { await client.query('ROLLBACK'); return { rosterConflict:true }; }
      let users = [];
      if (playerIds.length) {
        const result = await client.query("SELECT id,name FROM users WHERE id=ANY($1::uuid[]) AND role='player' AND status='active'",[playerIds]);
        if (result.rowCount !== playerIds.length) { await client.query('ROLLBACK'); return { rosterConflict:true }; }
        users = result.rows;
        const used = await client.query("SELECT 1 FROM tournament_teams tt JOIN tournament_roster_members rm ON rm.team_id=tt.id WHERE tt.tournament_id=$1 AND tt.status IN ('pending_roster','registered') AND (tt.captain_id=ANY($2::uuid[]) OR (rm.player_id=ANY($2::uuid[]) AND rm.status IN ('pending','accepted'))) LIMIT 1",[tournamentId,playerIds]);
        if (used.rowCount) { await client.query('ROLLBACK'); return { rosterConflict:true }; }
      }
      const userById = new Map(users.map((user) => [user.id,user.name]));
      const status = playerIds.length ? 'pending_roster' : 'registered';
      const teamResult = await client.query(`INSERT INTO tournament_teams(id,tournament_id,captain_id,team_name,roster_notes,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,tournamentId,captainId,teamName,rosterNotes || null,status]);
      for (const member of rosterMembers) {
        const playerId = member.playerId || null;
        const memberName = playerId ? userById.get(playerId) : String(member.memberName || '').trim();
        await client.query(`INSERT INTO tournament_roster_members(id,tournament_id,team_id,player_id,member_name,status) VALUES($1,$2,$3,$4,$5,$6)`,[crypto.randomUUID(),tournamentId,id,playerId,memberName,playerId ? 'pending' : 'manual']);
      }
      await client.query('COMMIT');
      const user = await findUserById(captainId);
      const roster = await client.query("SELECT rm.*,u.name AS account_name FROM tournament_roster_members rm LEFT JOIN users u ON u.id=rm.player_id WHERE rm.team_id=$1 ORDER BY rm.created_at",[id]);
      return tournamentTeamShape({ ...teamResult.rows[0],captain_name:user.name,captain_phone:user.phone,roster_members:roster.rows.map((row) => ({id:row.id,teamId:id,playerId:row.player_id || undefined,memberName:row.account_name || row.member_name,status:row.status,isManual:row.status === 'manual'})) });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let outcome = null;
    await session.withTransaction(async () => {
      const tournaments = mongoDb.collection('tournaments');
      const found = await tournaments.findOneAndUpdate({ id:tournamentId,status:'open' },{ $set:{ updated_at:now } },{ session,returnDocument:'after' });
      const tournament = found?.value || found;
      if (!tournament || String(tournament.start_date).slice(0,10) <= now.slice(0,10)) return;
      const teams = mongoDb.collection('tournament_teams');
      const count = await teams.countDocuments({ tournament_id:tournamentId,status:{ $in:['pending_roster','registered'] } },{ session });
      if (count >= Number(tournament.max_teams)) return;
      const size = tournament.team_size == null ? null : Number(tournament.team_size);
      if (size != null && rosterMembers.length !== size - 1) { outcome={rosterSizeError:size}; return; }
      const playerIds = rosterMembers.filter((member) => member.playerId).map((member) => member.playerId);
      if (new Set(playerIds).size !== playerIds.length || playerIds.includes(captainId)) { outcome={rosterConflict:true}; return; }
      const used = await teams.find({ tournament_id:tournamentId,status:{ $in:['pending_roster','registered'] } },{ session }).toArray();
      const existingIds = new Set(used.flatMap((team) => [team.captain_id]));
      if (existingIds.has(captainId)) { outcome={rosterConflict:true}; return; }
      const existingMembers = playerIds.length ? await mongoDb.collection('tournament_roster_members').find({ tournament_id:tournamentId,player_id:{ $in:playerIds },status:{ $in:['pending','accepted'] } },{session}).toArray() : [];
      if (playerIds.some((playerId) => existingIds.has(playerId)) || existingMembers.length) { outcome={rosterConflict:true}; return; }
      const users = playerIds.length ? await mongoDb.collection('users').find({ id:{ $in:playerIds },role:'player',status:'active' },{session}).toArray() : [];
      if (users.length !== playerIds.length) { outcome={rosterConflict:true}; return; }
      const userById = new Map(users.map((user) => [user.id,user.name]));
      const row = { id,tournament_id:tournamentId,captain_id:captainId,team_name:teamName,roster_notes:rosterNotes || '',status:playerIds.length ? 'pending_roster':'registered',registered_at:now };
      await teams.insertOne(row,{session});
      const memberRows = rosterMembers.map((member) => ({ id:crypto.randomUUID(),tournament_id:tournamentId,team_id:id,player_id:member.playerId || null,member_name:member.playerId ? userById.get(member.playerId) : String(member.memberName || '').trim(),status:member.playerId ? 'pending':'manual',created_at:now }));
      if (memberRows.length) await mongoDb.collection('tournament_roster_members').insertMany(memberRows,{session});
      const captain = await mongoDb.collection('users').findOne({id:captainId},{session});
      outcome = tournamentTeamShape({...row,captain_name:captain.name,captain_phone:captain.phone,roster_members:memberRows.map((member) => ({id:member.id,teamId:id,playerId:member.player_id || undefined,memberName:member.member_name,status:member.status,isManual:member.status === 'manual'}))});
    });
    return outcome;
  } finally { await session.endSession(); }
};

export const respondTournamentInvitation = async ({ memberId,playerId,decision }) => {
  const accepted = decision === 'accept'; const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const member = await client.query("SELECT rm.*,tt.status AS team_status FROM tournament_roster_members rm JOIN tournament_teams tt ON tt.id=rm.team_id WHERE rm.id=$1 AND rm.player_id=$2 AND rm.status='pending' AND tt.status='pending_roster' FOR UPDATE OF rm,tt",[memberId,playerId]);
      if (!member.rowCount) { await client.query('ROLLBACK'); return null; }
      if (accepted) {
        const duplicate = await client.query("SELECT 1 FROM tournament_teams tt LEFT JOIN tournament_roster_members other ON other.team_id=tt.id WHERE tt.tournament_id=$1 AND tt.id<>$2 AND tt.status IN ('pending_roster','registered') AND (tt.captain_id=$3 OR (other.player_id=$3 AND other.status IN ('pending','accepted'))) LIMIT 1",[member.rows[0].tournament_id,member.rows[0].team_id,playerId]);
        if (duplicate.rowCount) { await client.query('ROLLBACK'); return { duplicate:true }; }
      }
      await client.query('UPDATE tournament_roster_members SET status=$2,responded_at=NOW() WHERE id=$1',[memberId,accepted ? 'accepted':'declined']);
      if (!accepted) {
        await client.query("UPDATE tournament_teams SET status='withdrawn' WHERE id=$1",[member.rows[0].team_id]);
        await client.query("UPDATE tournament_roster_members SET status='declined',responded_at=NOW() WHERE team_id=$1 AND status='pending'",[member.rows[0].team_id]);
      } else {
        const pending = await client.query("SELECT COUNT(*)::int AS count FROM tournament_roster_members WHERE team_id=$1 AND status='pending'",[member.rows[0].team_id]);
        if (Number(pending.rows[0].count) === 0) await client.query("UPDATE tournament_teams SET status='registered' WHERE id=$1 AND status='pending_roster'",[member.rows[0].team_id]);
      }
      await client.query('COMMIT'); return { teamId:member.rows[0].team_id,status:accepted ? 'accepted':'declined' };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const session = mongoClient.startSession();
  try {
    let outcome = null;
    await session.withTransaction(async () => {
      const members = mongoDb.collection('tournament_roster_members');
      const member = await members.findOne({id:memberId,player_id:playerId,status:'pending'},{session});
      const team = member && await mongoDb.collection('tournament_teams').findOne({id:member.team_id,status:'pending_roster'},{session});
      if (!member || !team) return;
      if (accepted) {
        const otherTeams = await mongoDb.collection('tournament_teams').find({tournament_id:member.tournament_id,id:{ $ne:team.id },status:{ $in:['pending_roster','registered'] }},{session}).toArray();
        const duplicateMember = await members.findOne({tournament_id:member.tournament_id,team_id:{ $ne:team.id },player_id:playerId,status:{ $in:['pending','accepted'] }},{session});
        if (otherTeams.some((other) => other.captain_id === playerId) || duplicateMember) { outcome={duplicate:true}; return; }
      }
      await members.updateOne({id:memberId,status:'pending'},{$set:{status:accepted ? 'accepted':'declined',responded_at:now}},{session});
      if (!accepted) {
        await mongoDb.collection('tournament_teams').updateOne({id:team.id},{$set:{status:'withdrawn'}},{session});
        await members.updateMany({team_id:team.id,status:'pending'},{$set:{status:'declined',responded_at:now}},{session});
      } else if (await members.countDocuments({team_id:team.id,status:'pending'},{session}) === 0) {
        await mongoDb.collection('tournament_teams').updateOne({id:team.id,status:'pending_roster'},{$set:{status:'registered'}},{session});
      }
      outcome={teamId:team.id,status:accepted ? 'accepted':'declined'};
    });
    return outcome;
  } finally { await session.endSession(); }
};

export const withdrawTournamentTeam = async ({ tournamentId,teamId,actorId,actorRole }) => {
  const now = new Date().toISOString();
  if (dbProvider === 'postgres') {
    const result = await pool.query("UPDATE tournament_teams tt SET status='withdrawn' FROM tournaments t WHERE tt.id=$1 AND tt.tournament_id=$2 AND t.id=tt.tournament_id AND (tt.captain_id=$3 OR t.organizer_id=$3 OR $4='admin') AND tt.status IN ('pending_roster','registered') RETURNING tt.id",[teamId,tournamentId,actorId,actorRole]);
    if (!result.rowCount) return false;
    await pool.query("UPDATE tournament_roster_members SET status='declined',responded_at=NOW() WHERE team_id=$1 AND status='pending'",[teamId]);
    return true;
  }
  const team = await mongoDb.collection('tournament_teams').findOne({id:teamId,tournament_id:tournamentId,status:{ $in:['pending_roster','registered'] }});
  const tournament = team && await mongoDb.collection('tournaments').findOne({id:tournamentId});
  if (!team || (team.captain_id !== actorId && tournament?.organizer_id !== actorId && actorRole !== 'admin')) return false;
  await mongoDb.collection('tournament_teams').updateOne({id:teamId},{$set:{status:'withdrawn'}});
  await mongoDb.collection('tournament_roster_members').updateMany({team_id:teamId,status:'pending'},{$set:{status:'declined',responded_at:now}});
  return true;
};

export const closeDatabase = async () => {
  if (pool) await pool.end();
  if (mongoClient) await mongoClient.close();
};

export const applyPostgresSchema = async (statements) => {
  if (dbProvider !== 'postgres') {
    throw new Error('PostgreSQL SQL migrations cannot run while DB_PROVIDER=mongodb.');
  }
  for (const statement of statements) await pool.query(statement);
};

export const hasPostgresMigration = async (version) => {
  if (dbProvider !== 'postgres') throw new Error('PostgreSQL migrations cannot run while DB_PROVIDER=mongodb.');
  try { return (await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version])).rowCount > 0; }
  catch (error) { if (error.code === '42P01') return false; throw error; }
};

export const applyPostgresMigration = async ({ version, name, statements }) => {
  if (dbProvider !== 'postgres') throw new Error('PostgreSQL migrations cannot run while DB_PROVIDER=mongodb.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (alreadyApplied.rowCount) { await client.query('COMMIT'); return false; }
    for (const statement of statements) await client.query(statement);
    await client.query('INSERT INTO schema_migrations (version,name) VALUES ($1,$2) ON CONFLICT (version) DO NOTHING', [version, name]);
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
};

const ensureMongoIndexes = async () => {
  const getIndexesIfCollectionExists = async (collectionName) => {
    const exists = await mongoDb.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
    return exists ? mongoDb.collection(collectionName).listIndexes().toArray() : [];
  };
  const bookingSlotIndexes = await getIndexesIfCollectionExists('booking_slots');
  const slotReservationIndex = bookingSlotIndexes.find((index) => index.key?.slot_id === 1 && index.unique === true);
  if (slotReservationIndex) await mongoDb.collection('booking_slots').dropIndex(slotReservationIndex.name);
  const bookingIndexes = await getIndexesIfCollectionExists('bookings');
  const oldBookingIdempotencyIndex = bookingIndexes.find((index) => index.name === 'player_id_1_idempotency_key_1');
  if (oldBookingIdempotencyIndex) await mongoDb.collection('bookings').dropIndex(oldBookingIdempotencyIndex.name);
  await Promise.all([
    mongoDb.collection('users').createIndex({ email: 1 }, { unique: true }),
    mongoDb.collection('turf_owner_profiles').createIndex({ user_id: 1 }, { unique: true }),
    mongoDb.collection('turf_owner_profiles').createIndex({ billing_model: 1, approval_status: 1, subscription_due_date: 1 }),
    mongoDb.collection('turf_owner_profiles').createIndex({ pending_billing_model: 1, billing_model_change_effective_date: 1 }),
    mongoDb.collection('wallets').createIndex({ owner_id: 1 }, { unique: true }),
    mongoDb.collection('turfs').createIndex({ status: 1, city: 1, area: 1 }),
    mongoDb.collection('slots').createIndex({ turf_id: 1, date: 1, start_time: 1 }, { unique: true }),
    mongoDb.collection('booking_slots').createIndex({ slot_id: 1 }),
    mongoDb.collection('bookings').createIndex({ idempotency_key: 1 }, { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }),
    mongoDb.collection('bookings').createIndex({ cancellation_request_status: 1, cancellation_requested_at: 1 }),
    mongoDb.collection('reviews').createIndex({ booking_id: 1 }, { unique: true }),
    mongoDb.collection('notifications').createIndex({ user_id: 1, created_at: -1 }),
    mongoDb.collection('notifications').createIndex({ user_id: 1, 'data.eventKey': 1 }, { unique: true, partialFilterExpression: { 'data.eventKey': { $type: 'string' } } }),
    mongoDb.collection('favorites').createIndex({ player_id: 1, turf_id: 1 }, { unique: true }),
    mongoDb.collection('favorites').createIndex({ player_id: 1, created_at: -1 }),
    mongoDb.collection('turf_removal_requests').createIndex({ turf_id: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } }),
    mongoDb.collection('turf_removal_requests').createIndex({ status: 1, requested_at: 1 }),
    mongoDb.collection('owner_subscription_payments').createIndex({ owner_id: 1, billing_period_end: 1 }, { unique: true }),
    mongoDb.collection('push_subscriptions').createIndex({ endpoint_hash: 1 }, { unique: true }),
    mongoDb.collection('push_subscriptions').createIndex({ user_id: 1 }),
    mongoDb.collection('payments').createIndex({ transaction_id: 1 }, { unique: true, partialFilterExpression: { transaction_id: { $type: 'string' } } }),
    mongoDb.collection('refunds').createIndex({ gateway_request_id: 1 }, { unique: true, sparse: true }),
    mongoDb.collection('refunds').createIndex({ booking_id: 1, status: 1 }),
    mongoDb.collection('wallet_transactions').createIndex({ idempotency_key: 1 }, { unique: true, sparse: true }),
    mongoDb.collection('withdrawals').createIndex({ owner_id: 1, idempotency_key: 1 }, { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }),
    mongoDb.collection('cancellation_policies').createIndex({ is_default: 1 }, { unique: true, partialFilterExpression: { is_default: true } }),
    mongoDb.collection('staff_assignments').createIndex({ staff_user_id: 1, turf_id: 1 }, { unique: true }),
    mongoDb.collection('tournament_teams').createIndex({ tournament_id: 1, team_name: 1 }, { unique: true }),
    mongoDb.collection('open_matches').createIndex({ booking_id: 1 }, { unique: true }),
    mongoDb.collection('open_matches').createIndex({ status: 1, created_at: -1 }),
    mongoDb.collection('match_participants').createIndex({ match_id: 1, player_id: 1 }, { unique: true }),
    mongoDb.collection('match_participants').createIndex({ match_id: 1, status: 1 }),
    mongoDb.collection('tournament_teams').createIndex({ tournament_id: 1, status: 1 }),
    mongoDb.collection('tournament_roster_members').createIndex({ team_id: 1, created_at: 1 }),
    mongoDb.collection('tournament_roster_members').createIndex({ tournament_id: 1, player_id: 1, status: 1 }),
    mongoDb.collection('auth_codes').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    mongoDb.collection('audit_logs').createIndex({ entity_type: 1, entity_id: 1, created_at: -1 }),
    mongoDb.collection('schema_migrations').createIndex({ version: 1 }, { unique: true }),
  ]);
  await mongoDb.collection('schema_migrations').updateOne({ version: 1 }, { $setOnInsert: { name: '001_initial_schema', applied_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('schema_migrations').updateOne({ version: 3 }, { $setOnInsert: { name: '003_notifications', applied_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('schema_migrations').updateOne({ version: 4 }, { $setOnInsert: { name: '004_push_subscriptions', applied_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('schema_migrations').updateOne({ version: 13 }, { $setOnInsert: { name: '013_player_favorites', applied_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('schema_migrations').updateOne({ version: 14 }, { $setOnInsert: { name: '014_turf_removal_requests', applied_at: new Date().toISOString() } }, { upsert: true });
  await mongoDb.collection('schema_migrations').updateOne({ version: 15 }, { $setOnInsert: { name: '015_turf_correction_requests', applied_at: new Date().toISOString() } }, { upsert: true });
  const defaultPolicy = await mongoDb.collection('cancellation_policies').findOne({ is_default: true });
  if (!defaultPolicy) {
    const policyId = crypto.randomUUID();
    const now = new Date().toISOString();
    await mongoDb.collection('cancellation_policies').insertOne({ id: policyId, name: 'Standard', description: 'Default Section 10 cancellation policy', is_default: true, is_active: true, created_at: now, updated_at: now });
    await mongoDb.collection('cancellation_policy_tiers').insertMany([
      { id: crypto.randomUUID(), policy_id: policyId, hours_before_start_min: 0, hours_before_start_max: 6, refund_percentage: 0, sort_order: 0 },
      { id: crypto.randomUUID(), policy_id: policyId, hours_before_start_min: 6, hours_before_start_max: 24, refund_percentage: 50, sort_order: 1 },
      { id: crypto.randomUUID(), policy_id: policyId, hours_before_start_min: 24, hours_before_start_max: null, refund_percentage: 100, sort_order: 2 },
    ]);
  }
};

// Section 49: Open Match reads and captain posting. These records are social
// matchmaking data only; this code never writes to booking or payment ledgers.
const mapOpenMatchRow = (row) => ({
  id: row.id, bookingId: row.booking_id, bookingNumber: row.booking_number || '',
  captainId: row.captain_id, captainName: row.captain_name || '', captainPhone: row.captain_phone || '',
  turfId: row.turf_id, turfName: row.turf_name || '', date: String(row.booking_date || '').slice(0, 10),
  startTime: String(row.start_time || '').slice(0, 5), endTime: String(row.end_time || '').slice(0, 5),
  area: row.area || '', sportType: row.sport_type || '', skillLevel: row.skill_level,
  maxPlayers: Number(row.max_players), joinedCount: Number(row.joined_count), status: row.status,
  notes: row.notes || '', createdAt: row.created_at, updatedAt: row.updated_at,
});

export const createOpenMatchForBooking = async ({ bookingId, captainId, skillLevel, maxPlayers, notes }) => {
  if (dbProvider === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bookingResult = await client.query(
        `SELECT b.id,b.booking_number,b.player_id,b.turf_id,b.booking_date,b.start_time,b.end_time,b.status,
                t.name AS turf_name,t.area,COALESCE(t.sport_types[1],'') AS sport_type,u.name AS captain_name,u.phone AS captain_phone
         FROM bookings b JOIN turfs t ON t.id=b.turf_id JOIN users u ON u.id=b.player_id
         WHERE b.id=$1 FOR UPDATE OF b`, [bookingId]);
      const booking = bookingResult.rows[0];
      if (!booking || booking.player_id !== captainId || booking.status !== 'confirmed' || new Date(`${String(booking.booking_date).slice(0,10)}T${String(booking.start_time).slice(0,8)}+06:00`) <= new Date()) {
        await client.query('ROLLBACK'); return { error: 'booking_not_eligible' };
      }
      const id = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO open_matches (id,booking_id,captain_id,sport_type,skill_level,max_players,joined_count,status,notes)
         VALUES ($1,$2,$3,$4,$5,$6,1,'open',$7)
         RETURNING id,booking_id,captain_id,sport_type,skill_level,max_players,joined_count,status,notes,created_at,updated_at`,
        [id, bookingId, captainId, booking.sport_type, skillLevel, maxPlayers, notes || null]);
      await client.query('INSERT INTO match_participants (match_id,player_id,status) VALUES ($1,$2,\'joined\')', [id, captainId]);
      await client.query('COMMIT');
      return mapOpenMatchRow({ ...booking, ...result.rows[0] });
    } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') return { error: 'match_exists' }; throw error; }
    finally { client.release(); }
  }
  const booking = await mongoDb.collection('bookings').findOne({ id: bookingId, player_id: captainId, status: 'confirmed' });
  if (!booking) return { error: 'booking_not_eligible' };
  const start = new Date(`${String(booking.booking_date).slice(0,10)}T${String(booking.start_time).slice(0,8)}+06:00`);
  if (!(start > new Date())) return { error: 'booking_not_eligible' };
  const [turf, captain, existing] = await Promise.all([
    mongoDb.collection('turfs').findOne({ id: booking.turf_id }),
    mongoDb.collection('users').findOne({ id: captainId }),
    mongoDb.collection('open_matches').findOne({ booking_id: bookingId }),
  ]);
  if (existing) return { error: 'match_exists' };
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const row = { id, booking_id: bookingId, captain_id: captainId, sport_type: (turf?.sport_types || [])[0] || '', skill_level: skillLevel, max_players: maxPlayers, joined_count: 1, status: 'open', notes: notes || '', created_at: now, updated_at: now };
  try {
    await mongoDb.collection('open_matches').insertOne(row);
    await mongoDb.collection('match_participants').insertOne({ id: crypto.randomUUID(), match_id: id, player_id: captainId, joined_at: now, status: 'joined' });
  } catch (error) { if (error.code === 11000) return { error: 'match_exists' }; throw error; }
  return mapOpenMatchRow({ ...row, booking_number: booking.booking_number, booking_date: booking.booking_date, start_time: booking.start_time, end_time: booking.end_time, turf_id: booking.turf_id, turf_name: turf?.name, area: turf?.area, captain_name: captain?.name, captain_phone: captain?.phone });
};

export const listOpenMatches = async (filters = {}) => {
  if (dbProvider === 'postgres') {
    const values = []; const where = ["m.status IN ('open','full')", "(b.booking_date + b.end_time) > NOW() - INTERVAL '30 minutes'"];
    const add = (column, value) => { if (value) { values.push(`%${value}%`); where.push(`${column} ILIKE $${values.length}`); } };
    add('t.area', filters.area); add('m.sport_type', filters.sport); add('m.skill_level', filters.skill);
    if (filters.date) { values.push(filters.date); where.push(`b.booking_date=$${values.length}::date`); }
    const rows = await pool.query(`SELECT m.*,b.booking_number,b.booking_date,b.start_time,b.end_time,b.turf_id,t.name AS turf_name,t.area,u.name AS captain_name,u.phone AS captain_phone FROM open_matches m JOIN bookings b ON b.id=m.booking_id JOIN turfs t ON t.id=b.turf_id JOIN users u ON u.id=m.captain_id WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT 200`, values);
    return rows.rows.map(mapOpenMatchRow);
  }
  const query = { status: { $in: ['open', 'full'] } };
  if (filters.skill) query.skill_level = filters.skill;
  const matches = await mongoDb.collection('open_matches').find(query).sort({ created_at: -1 }).limit(200).toArray();
  const results = await Promise.all(matches.map(async (m) => {
    const booking = await mongoDb.collection('bookings').findOne({ id: m.booking_id });
    const [turf, captain] = await Promise.all([mongoDb.collection('turfs').findOne({ id: booking?.turf_id }), mongoDb.collection('users').findOne({ id: m.captain_id })]);
    if (!booking || !turf || (filters.area && !String(turf.area || '').toLowerCase().includes(filters.area.toLowerCase())) || (filters.sport && m.sport_type.toLowerCase() !== filters.sport.toLowerCase()) || (filters.date && String(booking.booking_date).slice(0,10) !== filters.date)) return null;
    return mapOpenMatchRow({ ...m, ...booking, turf_name: turf.name, area: turf.area, captain_name: captain?.name, captain_phone: captain?.phone });
  }));
  return results.filter(Boolean);
};

export const listOpenMatchParticipants = async (playerId) => {
  if (dbProvider === 'postgres') return (await pool.query(
    `SELECT p.id,p.match_id,p.player_id,u.name AS player_name,u.phone AS player_phone,p.joined_at,p.status
     FROM match_participants p JOIN users u ON u.id=p.player_id
     WHERE p.status='joined' AND EXISTS (SELECT 1 FROM open_matches m WHERE m.id=p.match_id AND m.status IN ('open','full'))
     ORDER BY p.joined_at`, [])).rows.filter((row) => row.player_id === playerId || row.status === 'joined').map((row) => ({ id: row.id, matchId: row.match_id, playerId: row.player_id, playerName: row.player_name, playerPhone: row.player_phone || '', joinedAt: row.joined_at, status: row.status }));
  const rows = await mongoDb.collection('match_participants').find({ status: 'joined' }).toArray();
  return Promise.all(rows.map(async (row) => {
    const [user, match] = await Promise.all([mongoDb.collection('users').findOne({ id: row.player_id }), mongoDb.collection('open_matches').findOne({ id: row.match_id, status: { $in: ['open','full'] } })]);
    return match && user ? { id: row.id, matchId: row.match_id, playerId: row.player_id, playerName: user.name, playerPhone: user.phone || '', joinedAt: row.joined_at, status: row.status } : null;
  })).then((items) => items.filter(Boolean));
};
