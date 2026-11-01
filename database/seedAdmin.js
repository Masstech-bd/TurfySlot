import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { closeDatabase, connectDatabase, createAdminAccount } from './provider.js';

dotenv.config();

const name = (process.env.ADMIN_NAME || '').trim();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
  throw new Error('Set ADMIN_NAME, valid ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) before seeding.');
}

try {
  await connectDatabase();
  const id = await createAdminAccount({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  process.stdout.write(`Created the initial admin account (${id}).\n`);
} finally {
  await closeDatabase();
}
