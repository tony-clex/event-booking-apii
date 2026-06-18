import { readFileSync } from 'fs';
import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const supabaseUrl = process.env.SUPABASE_URL;

async function readMigrationSql() {
  const sqlPath = new URL('../../migrations/001_initial_schema.sql', import.meta.url);
  return readFileSync(sqlPath, 'utf-8');
}

async function postgresClientOptions(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: {
      rejectUnauthorized: false,
    },
  };
}

async function applyWithPostgres() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return false;
  }

  const client = new Client(await postgresClientOptions(connectionString));

  try {
    await client.connect();
    await client.query(await readMigrationSql());
    return true;
  } catch (err) {
    console.error('Postgres migration error:', err.message);
    return false;
  } finally {
    await client.end();
  }
}

async function applyWithSupabaseExec() {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
      },
    },
  );

  const { error } = await supabase.rpc('exec', { sql_query: await readMigrationSql() });

  if (error) {
    console.error('Migration error:', JSON.stringify(error, null, 2));
    return false;
  }

  return true;
}

async function main() {
  if (await applyWithPostgres()) {
    console.log('Migration applied successfully');
    return;
  }

  if (await applyWithSupabaseExec()) {
    console.log('Migration applied successfully');
    return;
  }

  console.error('Provide DATABASE_URL in .env or enable the Supabase exec RPC function.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
