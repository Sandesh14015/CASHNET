## Summary

Describe the change and the phase it belongs to.

## Safety and data provenance

- [ ] Legacy `/api/*` synthetic workflow remains unchanged, or the reason is documented.
- [ ] No credentials, private keys, seed phrases, sensitive case data, or generated build artifacts are included.
- [ ] Provider/dataset facts retain source and confidence semantics where applicable.
- [ ] No unreviewed attribution or identity claim was introduced.

## Verification

- [ ] `pnpm run typecheck`
- [ ] `pnpm -r --if-present run test`
- [ ] `pnpm --filter @workspace/api-spec run codegen` (if contract changed)
- [ ] `pnpm --filter @workspace/api-server run build`
- [ ] `git diff --check`
