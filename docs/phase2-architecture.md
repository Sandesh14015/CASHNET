# Phase 2 architecture — persistence, RBAC, and case isolation

Phase 2 adds a PostgreSQL-backed `/api/v1` boundary while leaving the legacy `/api/*` synthetic workflow unchanged.

```text
v1 route → development actor authentication → permission + case authorization
         → business service → repository interface → PostgreSQL transaction
         → persistent response + append-only audit event
```

The migration ledger applies the portable baseline followed by the Phase 1 foundation and Phase 2 RBAC migration. Phase 2 introduces users, roles, permissions, user-role and role-permission links, case memberships, persistent investigations, wallet subjects, evidence extensions, and `audit_events`.

The development actor header is allowed only when explicitly enabled outside production. Roles and case membership come from persisted server-side records; client-supplied roles and case ownership are ignored. `CaseAuthorizationService` centralizes permission/case checks. An inaccessible case produces `NOT_FOUND`, not a membership hint, and writes a denied-access audit event.

Business services use repository interfaces. `PostgresRepositories.transaction` coordinates atomic case/investigation/evidence/audit flows. This phase does not perform provider collection; Phase 3 adds that collection only after case approval and investigation authorization.
