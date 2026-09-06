# Phase 5 service and VASP candidates

`ServiceAddressAssessmentService` distinguishes exchange entity, hot wallet, deposit address, custodial wallet, VASP, other service, and unknown. Current automated evidence can classify a known public service observation as an `EXCHANGE_ENTITY`; it deliberately does **not** infer that it is a deposit address. Service activity is an indicator, not proof.

`VaspCandidateService` reads case-scoped intelligence observations, Phase 4 stored graph relationships, and cautious Bitcoin clusters. It writes service assessments, candidates, and linked attribution evidence atomically. A candidate is a service/entity lead, not a customer or a real-world person.

Endpoints:

- `POST /api/v1/investigations/:id/vasp-analysis`
- `GET /api/v1/investigations/:id/vasp-candidates`

Candidates require `VASP_ANALYZE`; reads require `INTELLIGENCE_READ`. `CONFIRMED` is impossible from scoring alone and requires an explicit human-review/evidence policy represented by `attribution_reviews`.

The review endpoint requires `VASP_REVIEW`. Confirmation requires an uncontested `LIKELY` candidate, `PENDING_REVIEW` status, and at least two sourced supporting observations; confirmation/rejection require a rationale and append an immutable review and audit event.
