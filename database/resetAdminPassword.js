import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import { getMongoConnectionString } from './mongoConnection.js';

class AdminPasswordResetError extends Error {}

const isValidEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

export const resetAdminPassword = async ({ users, email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) throw new AdminPasswordResetError('Enter a valid admin email address.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new AdminPasswordResetError('Password must be 12–200 characters.');
  }

  const admin = await users.findOne(
    { email: normalizedEmail, role: 'admin' },
    { projection: { id: 1, role: 1 } },
  );
  if (!admin) throw new AdminPasswordResetError('No admin account with that email exists in the selected database.');

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await users.updateOne(
    { id: admin.id, email: normalizedEmail, role: 'admin' },
    {
      $set: { password_hash: passwordHash, updated_at: new Date().toISOString() },
      $inc: { token_version: 1 },
    },
  );
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new AdminPasswordResetError('The admin account changed during reset. No success was reported; verify the account and try again.');
  }
};

const parseExpectedDatabase = (args) => {
  if (args.includes('--help')) return null;
  if (args.length !== 2 || args[0] !== '--expected-database' || !args[1]?.trim()) {
    throw new AdminPasswordResetError('Provide --expected-database <exact MongoDB database name>.');
  }
  return args[1].trim();
};

const askVisible = (prompt) => new Promise((resolve, reject) => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.question(prompt, (answer) => {
    terminal.close();
    if (answer.trim().toLowerCase() === 'cancel') reject(new AdminPasswordResetError('Password reset cancelled.'));
    else resolve(answer);
  });
});

const askHidden = async (prompt) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new AdminPasswordResetError('Run this command in an interactive terminal so the password can be entered without echo.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          reject(new AdminPasswordResetError('Password reset cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && character !== '\u007f') value += character;
      }
    };
    process.stdout.write(prompt);
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
};

const readConfirmedPassword = async () => {
  const password = await askHidden('New password (input hidden): ');
  if (password.length < 12 || password.length > 200) {
    throw new AdminPasswordResetError('Password must be 12–200 characters.');
  }
  const confirmation = await askHidden('Confirm password (input hidden): ');
  if (password !== confirmation) throw new AdminPasswordResetError('Passwords do not match.');
  return password;
};

const printUsage = () => {
  process.stdout.write('Usage: npm run db:reset-admin-password -- --expected-database <exact MongoDB database name>\n');
};

const main = async () => {
  const expectedDatabase = parseExpectedDatabase(process.argv.slice(2));
  if (expectedDatabase === null) {
    printUsage();
    return;
  }

  dotenv.config({ quiet: true });
  const databaseName = (process.env.MONGODB_DATABASE || 'turfyslot').trim();
  if (databaseName !== expectedDatabase) {
    throw new AdminPasswordResetError('The configured MongoDB database does not match --expected-database. No data was changed.');
  }
  const mongoConnectionString = getMongoConnectionString();
  if (!mongoConnectionString) throw new AdminPasswordResetError('MONGODB_CONN is not configured (legacy MONGODB_URI is also supported).');

  const client = new MongoClient(mongoConnectionString, {
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const users = client.db(databaseName).collection('users');
    const email = String(await askVisible('Existing admin email (or type cancel): ')).trim().toLowerCase();
    if (!isValidEmail(email)) throw new AdminPasswordResetError('Enter a valid admin email address.');
    const admin = await users.findOne(
      { email, role: 'admin' },
      { projection: { id: 1, email: 1, status: 1 } },
    );
    if (!admin) throw new AdminPasswordResetError('No admin account with that email exists in the selected database.');

    process.stdout.write(`Selected existing admin: ${admin.email} (status: ${admin.status || 'active'}).\n`);
    const confirmation = await askVisible('Type RESET ADMIN PASSWORD to continue: ');
    if (confirmation !== 'RESET ADMIN PASSWORD') throw new AdminPasswordResetError('Confirmation did not match. No data was changed.');

    const password = await readConfirmedPassword();
    await resetAdminPassword({ users, email, password });
    process.stdout.write('Admin password reset successfully. Existing sessions have been invalidated.\n');
  } finally {
    await client.close();
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof AdminPasswordResetError
      ? error.message
      : 'A database or unexpected error occurred. No success was reported; check the database connection without sharing its URI.';
    process.stderr.write(`Admin password reset failed: ${message}\n`);
    printUsage();
    process.exitCode = 1;
  });
}
