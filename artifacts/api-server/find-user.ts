import { Client } from 'pg';
import fs from 'fs';

async function run() {
  const connectionString = process.env.CASHNET_MIGRATION_DATABASE_URL;
  const client = new Client({
    connectionString,
    ssl: {
      ca: fs.readFileSync('C:\\secure-path\\supabase-ca.pem').toString(),
      rejectUnauthorized: true,
    }
  });

  await client.connect();
  const res = await client.query("SELECT id, username FROM cashnet.users LIMIT 1");
  if (res.rows.length > 0) {
    console.log('FOUND:', res.rows[0]);
  } else {
    const insert = await client.query("INSERT INTO cashnet.users (username, roles, permissions, assigned_agencies) VALUES ('demo.admin', '[\"SUPERUSER\"]', '[\"ALL\"]', '[]') RETURNING id, username");
    console.log('CREATED:', insert.rows[0]);
  }
  await client.end();
}

run().catch(console.error);
