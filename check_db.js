const { Client } = require('pg');

async function testConnection() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is missing");
    return;
  }
  const fs = require('fs');
  const path = require('path');
  const caCertPath = process.env.CASHNET_SUPABASE_CA_CERT_PATH;
  const ca = caCertPath ? fs.readFileSync(path.resolve(caCertPath), 'utf8') : undefined;

  const parsed = new URL(dbUrl);
  parsed.searchParams.delete('sslmode');

  const config = {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 5000,
    ssl: {
      ca,
      rejectUnauthorized: true,
      servername: parsed.hostname,
    }
  };

  const client = new Client(config);
  try {
    await client.connect();
    console.log("Connection SUCCESSFUL");
    await client.end();
  } catch (err) {
    console.error("Connection FAILED:", err.message);
  }
}

testConnection();
