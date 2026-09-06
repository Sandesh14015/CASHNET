# Integration Decision Record

## ADR-001 — CASHNET remains the application root

**Decision:** Keep the current React, Express, OpenAPI/Zod and pnpm workspace as the product. Evidencly and all other repositories are sources of patterns, methodology, isolated services or reviewed data only.

**Reason:** CASHNET already owns the investigator workflow, generated contract boundary, synthetic demo, safety copy and case-centric UI. Replacing it would discard working scope and create unnecessary technology and licensing migrations.

**Consequence:** New functionality is introduced behind CASHNET service/provider interfaces and contract changes, followed by generated client/schema updates. No external repository is copied into `artifacts/` or added as a workspace package wholesale.

## ADR-002 — Synthetic mode stays supported and explicit

**Decision:** Preserve `CASHNET_DATA_MODE=synthetic` as a complete deterministic demo/test mode. Real adapters are opt-in server-side configuration.

**Reason:** It enables demonstration without credentials and is the existing safe behavior.

**Consequence:** Every response and persisted record carries explicit source provenance. Synthetic and real/API records are never merged implicitly. Tests use synthetic fixtures independently from recorded authorized provider fixtures.

## ADR-003 — Source facts precede analytics and attribution

**Decision:** Provider responses are normalized into facts before graphing, risk, labels or VASP candidates are evaluated. Inference output is a separate record type.

**Reason:** A wallet is not automatically criminal, and an address label or behavioral pattern is not real-world identity proof.

**Consequence:** A report distinguishes: on-chain fact, analytical inference, service/entity attribution, and unverified/unknown. Insufficient evidence returns `UNKNOWN` or `INSUFFICIENT_EVIDENCE`; it never fills the UI with a fabricated exchange or identity.

## ADR-004 — Bounded, authorized investigation only

**Decision:** Screening and deep investigation are distinct. Deep wallet tracing requires a case in `APPROVED` state plus RBAC/case access. Graph expansion is bounded BFS.

**Reason:** This minimizes unnecessary collection and protects investigators, subjects and provider resources.

**Consequence:** The case model migrates from current demo statuses to the stated authorization states (`DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CLOSED`) while preserving synthetic demo fixtures. Unapproved, rejected and closed cases cannot run deep providers.

## ADR-005 — Provider adapters are server-side ports

**Decision:** Implement ports for Ethereum/EVM, Bitcoin and TRON; provide Etherscan V2 (or authorized equivalent), Blockstream Esplora (or authorized equivalent), and TronGrid (or authorized equivalent) adapters behind them.

**Reason:** CASHNET needs provider interchangeability, secret containment, rate limits, testability and consistent normalization.

**Consequence:** Adapters get timeout, retry/backoff, pagination, rate-limit and malformed/empty response tests. Provider-specific raw payloads and opaque identifiers are retained. Frontend code calls CASHNET only.

## ADR-006 — Bitcoin remains UTXO-native

**Decision:** Model Bitcoin inputs, outputs and spending relationships explicitly. Do not reuse EVM balance-transfer assumptions.

**Reason:** Correct forward/backward trace evidence needs outpoints, values and spend tracking.

**Consequence:** CIOH/change/consolidation/CoinJoin analysis is labelled `INFERENCE`, contains heuristic evidence and false-positive limitations, and never collapses addresses into asserted ownership without support.

## ADR-007 — Labels are reviewed intelligence, not truth

**Decision:** Use `crypto-wallet-address-labels` only through a reviewable import pipeline with source-level provenance and expiry/verification metadata.

**Reason:** Its aggregate MIT license does not settle third-party source terms or accuracy.

**Consequence:** No raw data import occurs in this phase. Conflicting labels remain visible as conflicts. A public label can contribute to a VASP candidate but not by itself elevate it to confirmed or identify an exchange customer.

## ADR-008 — AGPL ChainForensics is not embedded

**Decision:** Treat ChainForensics as an AGPL methodology reference. Do not copy code, reuse its image, or link it into CASHNET.

**Reason:** CASHNET's licensing and distribution model have not been reviewed for AGPL compatibility.

**Consequence:** A future isolated-service option requires legal approval, deployment separation, a documented HTTP contract and attribution/notice compliance before implementation.

## ADR-009 — Risk is explainable and secondary

**Decision:** The initial suspicious-wallet screen uses deterministic, source-cited indicators. OpenAML is only a later research reference; models cannot establish on-chain facts or decide enforcement actions.

**Reason:** Research models may drift and are not validated for CASHNET's authorized data or jurisdictional setting.

**Consequence:** Output includes score, severity (`INSUFFICIENT_EVIDENCE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), indicators, evidence, confidence, model/rule version and provenance. Human review remains mandatory.

## ADR-010 — No government-system simulation claims

**Decision:** NCRP and SAHYOG remain interfaces with mock/sandbox fixtures only.

**Reason:** There are no official credentials/specifications in the repository.

**Consequence:** UI/reports state the limitation. Do not implement fake live connections or claim that submissions/disclosures have occurred.

## Rejected alternatives

- Replace CASHNET with Evidencly: rejected; it breaks the existing application boundary and changes stack/operational assumptions.
- Merge all reference projects: rejected; incompatible licensing, duplicate architectures and unreviewed datasets.
- Let the React client call explorer APIs: rejected; leaks investigation targets and secrets and bypasses case/audit control.
- Unbounded recursive tracing: rejected; costly, unsafe and inconsistent with authorized case scope.
- Treat VASP labels as identity: rejected; service attribution and customer identity are distinct.
