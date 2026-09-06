# Security policy

## Reporting a vulnerability

Please do not disclose vulnerabilities, credentials, personal data, private keys, seed phrases, or live investigation data in a public issue. Use GitHub's private vulnerability-reporting feature for this repository when enabled, or contact the repository owner privately through the GitHub account that owns the repository.

Include affected paths, a safe reproduction, impact, and suggested mitigation. Do not include real provider keys or sensitive case data.

## Security boundaries

- Provider credentials are server-only environment values.
- Synthetic mode is the default; authorized mode is explicit.
- Development actor authentication is deliberately rejected in production.
- Case access is centrally enforced and denied access is audited without confirming a case exists.
- Blockchain collection is read-only; CASHNET does not accept or handle private keys, seed phrases, or transaction signing material.

Production identity, deployment hardening, database RLS policies, and secrets management are pending work, not production-ready claims.
