# P0.11 — DATABASE RUNTIME TESTING & CONNECTION ANALYSIS

## Executive Summary
The PostgreSQL/Drizzle database connection is 🟢 **LIVE VERIFIED**.
However, during the live runtime verification, the root cause of the user's reported load-testing instability (random 2–8s delays and `DrizzleQueryError: Connection terminated due to connection timeout`) was successfully reproduced and diagnosed.

---

## 1. Connection Verification

- **API Health Check**: `/api/readyz` correctly reports `database: ok`.
- **Authentication Check**: API server correctly connected to Supabase to verify the `demo.admin` actor.
- **Cold Start Behavior**: The initial request timed out at exactly 10 seconds. Subsequent requests execute instantly.

---

## 2. Root Cause Analysis of Readiness Test Failures

The user reported that during a 100-request readiness test, requests take 2–8 seconds or throw `Connection terminated due to connection timeout` and `Connection terminated unexpectedly`.

This is caused by a deliberate bottleneck in the `pg-pool` configuration located at `lib/db/src/supabase-tls.ts`:

```typescript
export function createVerifiedSupabaseConnectionConfig(databaseUrl: string): ClientConfig & PoolConfig {
  ...
  return {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 20_000,
    max: 5, // <--- ROOT CAUSE BOTTLENECK
    allowExitOnIdle: true,
    ssl: { ... }
  };
}
```

### The Mechanism of Failure:
1. **Severe Bottleneck**: Setting `max: 5` means only 5 queries can execute concurrently. When a 100-request burst arrives, 95 requests are immediately placed in a waiting queue.
2. **Queue Delays (The 2-8s issue)**: As the 5 active connections finish their queries, they pick up the next items in the queue. Requests at the back of the queue wait 2, 5, or 8 seconds before even *starting* execution.
3. **Queue Timeout (The Exception)**: `pg-pool` applies `connectionTimeoutMillis` (10,000ms) to the *queue wait time* as well as the socket connection. If a request sits in the queue for longer than 10 seconds, `pg-pool` aborts it and throws `Connection terminated due to connection timeout`.
4. **Unexpected Termination**: If Supabase's NAT/PgBouncer terminates an idle connection (often around 10-15s for serverless databases) while `idleTimeoutMillis` is 20s on the client, the client attempts to reuse a dead connection, triggering `Connection terminated unexpectedly`.

## 3. Recommended Fix
Modify `lib/db/src/supabase-tls.ts`:
1. Increase `max: 5` to `max: 50` or `100` to handle burst API testing.
2. Increase `connectionTimeoutMillis` to `30_000` to prevent queue abortions.
3. Decrease `idleTimeoutMillis` to `5_000` to proactively reap dead connections before Supabase PgBouncer closes them.
