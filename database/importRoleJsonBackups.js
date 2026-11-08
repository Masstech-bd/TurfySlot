import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import { getMongoConnectionString } from './mongoConnection.js';
import { buildRestorePlan, getRestoreCounts, validateDestinationSnapshot, validateBackup } from './roleBackupRestore.js';
import { RestoreError } from './roleBackupRestoreErrors.js';

const categories = ['players', 'owners', 'admins'];

const parseArguments = (args) => {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (['--players', '--owners', '--admins', '--expected-database'].includes(option)) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new RestoreError(`Missing value for ${option}.`);
      parsed[option.slice(2)] = args[index + 1];
      index += 1;
    } else if (option === '--dry-run' || option === '--confirm') {
      if (parsed.mode) throw new RestoreError('Choose exactly one of --dry-run or --confirm.');
      parsed.mode = option.slice(2);
    } else {
      throw new RestoreError(`Unsupported option: ${option}.`);
    }
  }
  if (!parsed.players || !parsed.owners || !parsed.admins || !parsed['expected-database'] || !parsed.mode) {
    throw new RestoreError('Provide --players, --owners, --admins, --expected-database, and either --dry-run or --confirm.');
  }
  const inputPaths = categories.map((category) => path.resolve(parsed[category]));
  if (new Set(inputPaths).size !== inputPaths.length) throw new RestoreError('Each backup category must use a different file.');
  return {
    mode: parsed.mode,
    expectedDatabase: parsed['expected-database'],
    backupPaths: Object.fromEntries(categories.map((category) => [category, path.resolve(parsed[category])])),
  };
};

const readBackup = async (category, filePath) => {
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch {
    throw new RestoreError(`Could not read the ${category} backup file (${path.basename(filePath)}).`);
  }
  let backup;
  try {
    backup = JSON.parse(contents);
  } catch {
    throw new RestoreError(`The ${category} backup file (${path.basename(filePath)}) is not valid JSON.`);
  }
  return validateBackup(backup, category);
};

const readBackups = async (backupPaths) => Object.fromEntries(
  await Promise.all(categories.map(async (category) => [category, await readBackup(category, backupPaths[category])])),
);

const readDestinationSnapshot = async (database, session) => {
  const collectionInfos = await database.listCollections({}, { nameOnly: true }).toArray();
  const collectionCounts = {};
  let featureFlags = [];
  let policies = [];
  let tiers = [];
  const options = session ? { session } : {};
  for (const { name } of collectionInfos) {
    if (name.startsWith('system.')) continue;
    const collection = database.collection(name);
    const count = await collection.countDocuments({}, options);
    collectionCounts[name] = count;
    if (count === 0) continue;
    if (name === 'feature_flags') featureFlags = await collection.find({}, options).toArray();
    if (name === 'cancellation_policies') policies = await collection.find({}, options).toArray();
    if (name === 'cancellation_policy_tiers') tiers = await collection.find({}, options).toArray();
  }
  return { collectionCounts, featureFlags, policies, tiers };
};

export const assertDestinationIsEmpty = async (database, session) => {
  const snapshot = await readDestinationSnapshot(database, session);
  validateDestinationSnapshot(snapshot);
  return snapshot.collectionCounts;
};

const requireTransactionSupport = async (database) => {
  const hello = await database.command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new RestoreError('The destination MongoDB is standalone. Configure it as a replica set or sharded cluster before importing.');
  }
};

const readHiddenPassword = async (label) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new RestoreError('Admin passwords must be entered interactively in a terminal; do not pass them as command-line arguments or environment variables.');
  }

  const readOne = async (prompt) => new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    let value = '';
    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(new RestoreError('Admin password entry was cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ' && character !== '\u007f') {
          value += character;
        }
      }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });

  while (true) {
    const password = await readOne(`${label} password (input hidden): `);
    if (password.length < 12 || password.length > 200) {
      process.stdout.write('Password must be 12–200 characters. Try again.\n');
      continue;
    }
    const confirmation = await readOne('Confirm password (input hidden): ');
    if (password !== confirmation) {
      process.stdout.write('Passwords did not match. Try again.\n');
      continue;
    }
    return password;
  }
};

const getAdminPasswordHashes = async (admins) => {
  const hashes = new Map();
  for (let index = 0; index < admins.length; index += 1) {
    const password = await readHiddenPassword(`New password for admin account ${index + 1} of ${admins.length}`);
    hashes.set(admins[index].id, await bcrypt.hash(password, 12));
  }
  return hashes;
};

const applyAdminPasswords = (plan, hashes) => {
  const users = plan.get('users') || [];
  for (const user of users) {
    if (user.role === 'admin') {
      const passwordHash = hashes.get(user.id);
      if (!passwordHash) throw new RestoreError('A new password was not provided for every admin account.');
      user.password_hash = passwordHash;
    }
  }
};

export const writeRestorePlan = async (client, database, plan) => {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await assertDestinationIsEmpty(database, session);
      for (const [collectionName, records] of plan) {
        await database.collection(collectionName).insertMany(records, { session, ordered: true });
      }
      for (const [collectionName, records] of plan) {
        const insertedCount = await database.collection(collectionName).countDocuments(
          { id: { $in: records.map((record) => record.id) } },
          { session },
        );
        if (insertedCount !== records.length) {
          throw new RestoreError(`Post-import verification failed for ${collectionName}.`);
        }
      }
    }, {
      readConcern: { level: 'snapshot' },
      readPreference: 'primary',
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
};

const printPlan = (databaseName, plan, writeOutput) => {
  writeOutput(`Target database: ${databaseName}\n`);
  writeOutput('Validated restore counts (duplicate IDs merged only when records match exactly):\n');
  for (const [collection, count] of Object.entries(getRestoreCounts(plan))) {
    writeOutput(`  ${collection}: ${count}\n`);
  }
};

export const runRestore = async (options, dependencies = {}) => {
  const backups = await readBackups(options.backupPaths);
  const plan = buildRestorePlan(backups);
  const databaseName = (process.env.MONGODB_DATABASE || 'turfyslot').trim();
  if (databaseName !== options.expectedDatabase) {
    throw new RestoreError('The configured MongoDB database does not match --expected-database. No data was changed.');
  }
  const mongoConnectionString = getMongoConnectionString();
  if (!mongoConnectionString) throw new RestoreError('MONGODB_CONN is not configured (legacy MONGODB_URI is also supported).');

  const createClient = dependencies.createClient || ((uri, clientOptions) => new MongoClient(uri, clientOptions));
  const writeOutput = dependencies.writeOutput || ((text) => process.stdout.write(text));
  const client = createClient(mongoConnectionString, {
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const database = client.db(databaseName);
    await assertDestinationIsEmpty(database);
    printPlan(databaseName, plan, writeOutput);
    writeOutput('Excluded from these exports: existing passwords, private owner documents/payout details, and uploaded files.\n');
    if (options.mode === 'dry-run') {
      writeOutput('Dry run complete. No database records were written.\n');
      return;
    }

    await requireTransactionSupport(database);
    const hashes = await getAdminPasswordHashes(plan.get('users').filter((user) => user.role === 'admin'));
    applyAdminPasswords(plan, hashes);
    await writeRestorePlan(client, database, plan);
    writeOutput('Restore completed and inserted record counts were verified.\n');
  } finally {
    await client.close();
  }
};

const printUsage = () => {
  process.stdout.write(
    'Usage: node database/importRoleJsonBackups.js --players <file> --owners <file> --admins <file> --expected-database <name> --dry-run|--confirm\n',
  );
};

const main = async () => {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }
  const options = parseArguments(process.argv.slice(2));
  dotenv.config({ quiet: true });
  await runRestore(options);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof RestoreError) {
      process.stderr.write(`Restore failed: ${error.message}\n`);
    } else {
      process.stderr.write('Restore failed due to an unexpected file or database error. No success was reported.\n');
    }
    printUsage();
    process.exitCode = 1;
  });
}
