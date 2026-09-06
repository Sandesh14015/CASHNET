# CASHNET Phase 6 — Security Model

## Authentication

### Development Mode (Existing, Unchanged)

`DevelopmentActorAuthenticator` remains available only when
`CASHNET_DEV_AUTH_ENABLED=true` and `NODE_ENV !== "production"`.

### Production Mode (Phase 6.6)

Generic OIDC/JWT verification abstraction:

| Requirement | Implementation |
|---|---|
| Issuer verification | Validate `iss` claim against configured allowlist |
| Audience verification | Validate `aud` claim against `CASHNET_JWT_AUDIENCE` |
| Signature verification | RS256/ES256 via JWKS endpoint |
| Expiry | Validate `exp` claim with configurable clock skew (default 30s) |
| Key rotation | JWKS cache with TTL-based refresh |
| Revocation | Token introspection endpoint (optional, configurable) |
| Account disablement | `users.status = 'DISABLED'` check after token validation |
| Role mapping | JWT claims → CASHNET roles via configurable claim path |

No specific provider (Auth0/Keycloak/etc.) is hardcoded.

## Authorization (RBAC)

### Existing Roles (Phase 5)

| Role | Phase 5 Permissions |
|---|---|
| ADMIN | All permissions |
| SUPERVISOR | INTELLIGENCE_*, CLUSTER_*, VASP_*, EVIDENCE_REVIEW |
| INVESTIGATOR | INTELLIGENCE_READ/EXECUTE, CLUSTER_ANALYZE, VASP_ANALYZE |
| ANALYST | INTELLIGENCE_READ |
| VIEWER | INTELLIGENCE_READ |

### Phase 6 Extensions

| New Role | Purpose |
|---|---|
| SENIOR_INVESTIGATOR | Investigator + risk analysis + report generation |
| REVIEWER | Dedicated evidence/candidate review |
| AUDITOR | Read-only audit and report access |

| New Permission | Scope |
|---|---|
| RISK_ANALYZE | Execute AML risk analysis |
| RISK_READ | Read risk indicators and typology results |
| COLLECTION_BNB | Collect BNB Chain data |
| COLLECTION_POLYGON | Collect Polygon data |
| COLLECTION_SOLANA | Collect Solana data |
| REPORT_GENERATE | Generate forensic reports |
| REPORT_EXPORT | Export reports |
| AUDIT_EXPORT | Export audit trails |
| DEFI_ANALYZE | Execute DeFi/MEV analysis |
| GRAPH_FEATURES | Compute graph features |

### Least Privilege Mapping

Permissions are never granted merely because a role exists.
Each role→permission assignment is explicitly justified.

## Case Isolation

### Current (Phase 5)

Server-side enforcement via `case_memberships` JOIN in every repository query.
Frontend hiding is never treated as an isolation boundary.

### Phase 6 Hardening

- Evaluate PostgreSQL Row-Level Security (RLS) for case-scoped tables
- Add `request_id` to all audit events for correlation
- Cross-case queries fail closed (no data returned, not an error)
- Supervisor override requires explicit policy and audit

## API Security

| Control | Implementation |
|---|---|
| HTTPS | TLS termination at reverse proxy (not in application) |
| Secure headers | HSTS, X-Content-Type-Options, X-Frame-Options, CSP |
| CORS | Configurable allowlist via `CASHNET_CORS_ORIGINS` |
| Rate limiting | Per-IP and per-user token bucket |
| Request size | 1MB default, configurable |
| Request ID | UUID generated per request, propagated to audit |
| Input validation | Zod schemas on all request bodies/params |
| Output validation | Structured response schemas |
| Secret redaction | No DATABASE_URL, API keys, or tokens in logs |

### Expensive Endpoint Protection

Graph, risk, clustering, MEV, and evaluation endpoints are rate-limited
more aggressively than CRUD endpoints.

## Secrets Management

### Development
Environment variables via `.env` (gitignored).

### Production
Vault/KMS/secret manager (provider-neutral design).

### Never Committed
- `.env` files
- API keys
- Database passwords/URLs with credentials
- JWT signing secrets
- Private keys
- Cloud credentials

## Database Security

| Control | Implementation |
|---|---|
| Application role | Least-privilege PostgreSQL role (SELECT, INSERT, UPDATE on app tables) |
| Migration role | Separate role with DDL permissions |
| TLS | `sslmode=verify-full`, Supabase project CA PEM, and Node hostname/certificate verification in production connection configuration |
| Connection pooling | pg pool with max connections, idle timeout |
| Statement timeout | `statement_timeout = '30s'` for application queries |
| Transaction timeout | Application-level transaction boundaries |

## Provider Security

All external provider integrations defend against:

| Threat | Defense |
|---|---|
| SSRF | Allowlisted provider hostnames only |
| Malicious redirects | Disable automatic redirect following |
| URL injection | Provider URLs from config only, never user input |
| Unbounded response | Response size limit (10MB default) |
| Malformed payloads | Zod validation on all provider responses |
| Retry storms | Exponential backoff with jitter, max retries |
| Rate-limit violations | Provider-specific rate limiting with backoff |
| Request amplification | Sequential requests, not parallel fan-out |
| DoS | Request timeout (10s default, configurable) |

## Audit

Every material action is attributable:

| Field | Source |
|---|---|
| who | `actor.id` from authenticated request |
| what | `action` field (typed enum) |
| when | `created_at` (server timestamp) |
| case | `case_id` (investigation scope) |
| resource | `resource_type` + `resource_id` |
| outcome | `result` (SUCCESS/DENIED/ERROR) |
| request | `request_id` (correlation) |

Audit events are append-only. The `audit_events` table has a trigger
that prevents UPDATE and DELETE.
