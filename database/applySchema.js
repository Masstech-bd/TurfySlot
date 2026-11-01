import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPostgresMigration, applyPostgresSchema, closeDatabase, connectDatabase, dbProvider, hasPostgresMigration, migrateSensitivePayoutDetails } from './provider.js';

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await connectDatabase();
  if (dbProvider === 'postgres') {
    if (!(await hasPostgresMigration(1))) {
      const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
      const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
      await applyPostgresSchema(statements);
      console.log('PostgreSQL base schema applied successfully.');
    }
    await migrateSensitivePayoutDetails();
    const migrationDirectory = path.join(here, 'migrations', 'postgres');
    if (fs.existsSync(migrationDirectory)) {
      const migrationFiles = fs.readdirSync(migrationDirectory).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
      for (const file of migrationFiles) {
        const version = Number(file.match(/^\d+/)?.[0]);
        const sql = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
        const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
        let applied;
        try {
          applied = await applyPostgresMigration({ version, name: file.replace(/\.sql$/, ''), statements });
        } catch (error) {
          throw new Error(`PostgreSQL migration ${file} failed: ${error.message}`, { cause: error });
        }
        if (applied) console.log(`PostgreSQL migration ${file} applied.`);
      }
    }
    console.log('PostgreSQL schema and migrations are ready.');
  } else {
    console.log('MongoDB collections and indexes initialized successfully.');
    await migrateSensitivePayoutDetails();
  }
  console.log('Sensitive payout data is encrypted and ready.');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
