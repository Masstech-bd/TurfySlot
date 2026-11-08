import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import { getMongoConnectionString } from './mongoConnection.js';

class FirstAdminError extends Error {}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^\S+@\S+\.\S+$/.test(email);
const emailLookup = (email) => ({
  email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
});

export const createFirstAdmin = async ({ users, name, email, password }) => {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedName || normalizedName.length > 255) {
    throw new FirstAdminError('Name must be 1–255 characters.');
  }
  if (!validEmail(normalizedEmail) || normalizedEmail.length > 255) {
    throw new FirstAdminError('Enter a valid email address (maximum 255 characters).');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new FirstAdminError('Password must be 12–200 characters.');
  }

  const adminCount = await users.countDocuments({ role: 'admin' });
  if (adminCount > 0) throw new FirstAdminError('An admin account already exists; use the password-reset command instead.');
  if (await users.findOne(emailLookup(normalizedEmail), { projection: { id: 1 } })) {
    throw new FirstAdminError('An account already uses that email address.');
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    name: normalizedName,
    email: normalizedEmail,
    password_hash: await bcrypt.hash(password, 12),
    role: 'admin',
    status: 'active',
    token_version: 0,
    created_at: now,
    updated_at: now,
  };
  try {
    await users.insertOne(user);
  } catch (error) {
    if (error?.code === 11000) throw new FirstAdminError('An account already uses that email address.');
    throw error;
  }
  return user.id;
};

const askVisible = (prompt) => new Promise((resolve, reject) => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.question(prompt, (answer) => {
    terminal.close();
    if (answer.trim().toLowerCase() === 'cancel') reject(new FirstAdminError('Admin creation cancelled.'));
    else resolve(answer);
  });
});

const askHidden = async (prompt) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new FirstAdminError('Run this command in an interactive terminal so the password can be entered without echo.');
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
          reject(new FirstAdminError('Admin creation cancelled.'));
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
  const password = await askHidden('New admin password (input hidden): ');
  if (password.length < 12 || password.length > 200) {
    throw new FirstAdminError('Password must be 12–200 characters.');
  }
  const confirmation = await askHidden('Confirm password (input hidden): ');
  if (password !== confirmation) throw new FirstAdminError('Passwords do not match.');
  return password;
};

const printUsage = () => {
  process.stdout.write('Usage: npm run db:create-first-admin -- --expected-database <exact MongoDB database name>\n');
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printUsage();
    return;
  }
  if (args.length !== 2 || args[0] !== '--expected-database' || !args[1]?.trim()) {
    throw new FirstAdminError('Provide --expected-database <exact MongoDB database name>.');
  }

  dotenv.config({ quiet: true });
  const expectedDatabase = args[1].trim();
  const databaseName = (process.env.MONGODB_DATABASE || 'turfyslot').trim();
  if (databaseName !== expectedDatabase) {
    throw new FirstAdminError('The configured MongoDB database does not match --expected-database. No data was changed.');
  }
  const mongoConnectionString = getMongoConnectionString();
  if (!mongoConnectionString) throw new FirstAdminError('MONGODB_CONN is not configured (legacy MONGODB_URI is also supported).');

  const client = new MongoClient(mongoConnectionString, {
    connectTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const users = client.db(databaseName).collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    const adminCount = await users.countDocuments({ role: 'admin' });
    if (adminCount > 0) throw new FirstAdminError('An admin account already exists; no account was created.');

    const name = String(await askVisible('Admin name (or type cancel): ')).trim();
    const email = normalizeEmail(await askVisible('Admin email (or type cancel): '));
    if (!name || name.length > 255) throw new FirstAdminError('Name must be 1–255 characters.');
    if (!validEmail(email) || email.length > 255) throw new FirstAdminError('Enter a valid email address (maximum 255 characters).');
    if (await users.findOne(emailLookup(email), { projection: { id: 1 } })) {
      throw new FirstAdminError('An account already uses that email address. No account was created.');
    }

    process.stdout.write(`Target database: ${databaseName}\nNew admin email: ${email}\n`);
    const confirmation = await askVisible('Type CREATE FIRST ADMIN to continue: ');
    if (confirmation !== 'CREATE FIRST ADMIN') throw new FirstAdminError('Confirmation did not match. No data was changed.');

    const password = await readConfirmedPassword();
    const id = await createFirstAdmin({ users, name, email, password });
    process.stdout.write(`First admin account created successfully (${id}).\n`);
  } finally {
    await client.close();
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof FirstAdminError
      ? error.message
      : 'A database or unexpected error occurred. No success was reported; verify the database connection without sharing its URI.';
    process.stderr.write(`First admin creation failed: ${message}\n`);
    printUsage();
    process.exitCode = 1;
  });
}
