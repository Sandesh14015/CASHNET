const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) { console.log('DATABASE_URL is EMPTY or UNSET'); process.exit(0); }
try {
  const u = new URL(dbUrl);
  console.log('username=' + decodeURIComponent(u.username));
  console.log('hostname=' + u.hostname);
  console.log('port=' + u.port);
  console.log('pathname=' + u.pathname);
  console.log('password_length=' + decodeURIComponent(u.password).length);
  console.log('password_empty=' + (decodeURIComponent(u.password).length === 0));
} catch (e) { console.log('PARSE_ERROR: ' + e.message); }
