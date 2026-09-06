# Production identity operations

`demo.investigator`, `demo.supervisor`, and `demo.admin` are development
fixtures created by historical migrations for local validation. They are not
production identities.

The production JWT/OIDC boundary rejects any verified `demo.*` subject before
it can be resolved to a CASHNET user or receive a role. This does not replace
deployment account hygiene.

Before admitting production traffic, inspect the target deployment database
under an approved change record:

```sql
SELECT username, status
FROM users
WHERE username LIKE 'demo.%'
ORDER BY username;
```

On a production database only, disable retained fixture identities through the
organisation's access-management procedure:

```sql
UPDATE users
SET status = 'DISABLED'
WHERE username LIKE 'demo.%' AND status = 'ACTIVE';
```

Do not run this statement against a local validation database that intentionally
uses development actors. Production administrators must be separately
provisioned and mapped to active CASHNET users with least-privilege roles.
JWT claims do not grant CASHNET roles.
