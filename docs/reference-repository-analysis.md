# Reference Repository Analysis

**Scope.** This review treats CASHNET as the destination application. The repositories in `references/` are not vendored dependencies and are not part of the pnpm workspace. Findings below were made from the checked-out revisions on 2026-08-27; upstream licenses and data provenance must be rechecked at the exact revision selected for any future import.

## Summary decisions

| Repository | License found | Decision | Why |
| --- | --- | --- | --- |
| `rohteemie/Open-Source-Blockchain-Forensics` | MIT | Adapt small patterns after rewrite | Small Bitcoin provider/normalization/clustering examples; not a complete production system. |
| `manic-startup/chainforensics` | AGPL-3.0 | Reference only; optional isolated service | Strong UTXO methodology, but copying/linking code could impose AGPL obligations. |
| `Copexit/am-i-exposed` | MIT | Candidate isolated Bitcoin analysis service | Mature heuristics/tests; its browser-first privacy model does not fit a server investigation system directly. |
| `Evidencly/evidencly-platform` | MIT | Architecture reference | Useful graph/evidence/report patterns, but different Python/FastAPI application and unsafe defaults for CASHNET's authorization model. |
| `ImMike/crypto-wallet-address-labels` | MIT repository license | Data-source candidate, not automatic import | Aggregates third-party datasets whose individual provenance and terms vary. |
| `VincenzoImp/bitcoin-address-clustering` | MIT | Methodology reference | Historical (2009–2011) Spark data and high resource requirements make it unsuitable as production chain data. |
| `AML-Solana/mev-wallet-cluster-analysis` | MIT | Ethereum evidence methodology reference | A focused case study, not a reusable tracing platform. |
| `finos-labs/dtcch-2025-OpenAML` | Apache-2.0 | Later AML/risk reference | Research models/data need validation, licensing and drift review; deterministic facts must remain provider-derived. |

## Per-repository review

### Open-Source-Blockchain-Forensics

- **Architecture:** Python CLI-oriented Bitcoin MVP with a `Provider` protocol, Blockstream/Bitcoin RPC collectors, a normalizer, CIOH clustering, simple cluster scoring, and JSON/CSV reporting. The README's broader Ethereum/graph/ML design remains largely planned.
- **Useful modules and exact reference points:** `blockchain_forensics/providers/base.py` (`Provider.fetch_address_txs`), `providers/blockstream.py` (`BlockstreamProvider.fetch_address_txs` with bounded pagination and malformed-response handling), `normalizer.py` (`normalize_blockstream_txs`), `models.py` (`Transaction`, `TxIO`), `clustering.py` (`UnionFind`, `cluster_cioh`), and `scoring.py` (`score_clusters`). Tests in `tests/test_normalizer.py` and `tests/test_clustering.py` show compact fixture-based testing.
- **Adaptation value:** Reimplement the patterns in TypeScript under CASHNET's contracts: provider interface, lossless Bitcoin input/output normalization, bounded page iteration, and heuristic evidence counts. Do not carry across its very small confidence formula as a production attribution score.
- **Risks:** Its transaction model omits previous-output references, vout indexes, confirmation/block metadata, raw-reference persistence, and error taxonomy required by CASHNET. Public Blockstream use requires rate limiting and an availability fallback.
- **License/data:** MIT code. Blockchain facts come from a provider, not bundled data. Preserve the provider URL, retrieval time, raw response reference and API terms in CASHNET.
- **Decision:** Adapt patterns only; do not import as a dependency or service.

### ChainForensics

- **Architecture:** Dockerized Python/FastAPI application built around a local Bitcoin node, with background indexing and a static frontend/MCP option. It contains UTXO tracing, CoinJoin and peeling-chain detection, temporal/value/wallet-fingerprint analysis, clustering and visualization.
- **Useful reference points:** `backend/app/core/tracer.py`, `clustering_heuristics.py`, `coinjoin.py`, `temporal_analysis.py`, `value_analysis.py`, `wallet_fingerprint.py`, `privacy_analysis.py`, `union_find.py`, and API modules under `backend/app/api/`. `docker-compose.yml` is useful only as an operational reference for a local-node deployment.
- **Risks:** `LICENSE` is AGPL-3.0. The repository's use through a network service does not remove the need for an explicit licensing review. Its broad claims/heuristic thresholds also need CASHNET-specific evaluation and evidence vocabulary.
- **License/data:** AGPL-3.0 code; data comes from a locally operated Bitcoin node. No code, container image, or adapted substantial code enters CASHNET without written license approval.
- **Decision:** Reference only. A separately deployed AGPL service is possible later only after legal/operational approval and with a stable, documented API boundary.

### am-i-exposed

- **Architecture:** MIT TypeScript/Next.js, CLI and MCP scanner that fetches Bitcoin data from mempool.space (or a self-hosted endpoint), runs client-side heuristics, matches entities, produces JSON output, and optionally computes Boltzmann analysis through Rust/WASM.
- **Useful reference points:** `src/lib/analysis/chain-trace.ts` (`runChainTrace`), `address-orchestrator.ts`, heuristic modules under `src/lib/analysis/heuristics/`, entity filtering under `src/lib/analysis/entity-filter/`, API retry/rate-limit/cache modules in `src/lib/api/`, and CLI JSON output in `cli/src/output/json.ts`. Its extensive tests include `src/lib/analysis/chain/__tests__/forward.test.ts`, `backward.test.ts`, `peel-chain-trace.test.ts`, and provider tests under `src/lib/api/__tests__/`.
- **Risks:** It is deliberately browser-first and tells users that lookup privacy is not complete. CASHNET must not send investigation addresses/API credentials from the frontend, and its privacy score must not be repurposed as a criminality or VASP-attribution score. WASM/Rust, Next.js, a large entity index, Cloudflare workers, and mempool-specific response shapes raise integration complexity.
- **License/data:** MIT code. Entity data and OFAC/source data require separate provenance review; public labels are assertions, not identity proof.
- **Decision:** Prefer a separately deployed/adapted MIT Bitcoin-analysis component or a clean-room TypeScript port of selected algorithms. Integrate only through server-side adapters and recorded fixtures.

### Evidencly Platform

- **Architecture:** React frontend plus Python/FastAPI backend and PostgreSQL. The backend ingests EVM explorer records into `graph_nodes`/`graph_edges`, stores known entities and annotations, recursively traverses a graph, provides a timeline, and exports a PDF report. Docker compose and `.env.example` demonstrate a self-hosted deployment.
- **Useful reference points:** `backend/main.py`: `add_node_if_not_exists`, edge insertion, `traverse_graph`, known-entity enrichment, timeline endpoint and the report exporter. `ARCHITECTURE.md`, `docker-compose.yml`, and `docs/case-studies/harmony-bridge-hack.md` are useful process references.
- **Risks:** One large backend file mixes ingestion, persistence, graph traversal, external scraping/search, LLM narrative generation and reports. Its README advertises recursive 10-hop tracing; CASHNET must use bounded BFS with branch, time and amount limits instead. Its code performs web/social enrichment and an AI narrative path that must never establish transaction facts or attribution.
- **License/data:** MIT code. Etherscan and third-party web/social material have independent terms. Labels and scraped material require URL, retrieval timestamp and validation state.
- **Decision:** Use as an architecture reference. Recreate the good concepts—edge evidence, graph/timeline consistency, source-integrity report footer—inside CASHNET's OpenAPI-first TypeScript architecture.

### Crypto Wallet Address Labels

- **Architecture:** A curated repository of CSV/JSON datasets, not a runtime service. It groups Ethereum exchange/DEX labels, phishing/scam labels, contracts, cluster labels, BTC/ETH/BCH labels, BSC/Ethereum tags and Solana labels.
- **Useful reference points:** dataset-specific READMEs in `datasets/ethereum-exchange-and-dex-labels/`, `ethereum-phishing-and-scam-labels/`, `ethereum-cluster-exchange-labels/`, `multi-chain-crypto-address-labels/`, `bsc-ethereum-address-tags/`, and `solana-wallet-and-program-labels/`. These describe formats and upstream sources.
- **Risks:** The repository license does not automatically grant rights over every aggregated file. Labels may be stale, conflicting, scraped, inaccurate, chain-normalization inconsistent, or based on source data that limits redistribution. Some samples are transaction classifications rather than address ownership labels.
- **License/data:** Repository code/content is MIT, but every selected record needs an import manifest with dataset version/commit, upstream URL, upstream license/terms, source record ID, chain/address normalization, imported-at, first/last verified, confidence and review status.
- **Decision:** Candidate data source only. Build an offline, reviewed importer later; no labels are seeded into production and no label alone produces CONFIRMED VASP attribution.

### Bitcoin Address Clustering

- **Architecture:** Python/Spark research project that downloads historical Bitcoin data, creates directed transaction/UTXO graphs, runs multiple address heuristics, and displays clusters using Streamlit/PyVis.
- **Useful reference points:** `bitcoin_address_clustering.py` contains `address_clustering` and graph-construction workflow; `app/app.py` visualizes a selected cluster. The README documents common-input, consolidation, change and CoinJoin-related heuristics.
- **Risks:** The bundled/linked range is only early Bitcoin history (through approximately block 115,000, 2011). It recommends approximately 50 GB RAM and uses Spark/NetworkX. Historical outputs cannot be treated as current data or ground truth; several heuristics inherently cause false positives.
- **License/data:** MIT code; its data derives from Blockchain.info-era collection and needs independent terms/provenance review. Do not redistribute the historical archive without that review.
- **Decision:** Methodology reference only. Implement modern, per-investigation, evidence-backed heuristics using live authorized data; record every inference separately from fact.

### MEV Wallet Cluster Analysis

- **Architecture:** MIT Ethereum case study plus a candidate-discovery SQL query. It maps funding, deployment, interaction and off-ramp relationships and explicitly explains how it verified each asserted edge.
- **Useful reference points:** `README.md` sections “Methodology” and “Limitations”, and `queries/wallet_discovery.sql`. The key reusable practice is cross-checking the same transaction hash at both ends and checking contract-creator data at the contract itself.
- **Risks:** It is a single manual case, not code to operationalize. Its discovery query generates candidates, has documented limitations, and must not be labelled as a profit detector or identity finder.
- **License/data:** MIT repository. Explorer results and any linked exchange labels still require source retention and terms review.
- **Decision:** Use as an Ethereum evidence-standard reference. Carry its claim/evidence/limitation discipline into CASHNET's evidence and VASP-candidate records.

### OpenAML

- **Architecture:** Apache-2.0 academic AML research repository containing feature/model material, labelled data, a prototype pipeline, papers and an OpenKYT experiment. Models include binary and multi-class classifiers trained on stablecoin-related behavior.
- **Useful reference points:** `Whitepaper.md`, `Data/README.md`, `Model/README.md`, `Model/MultiClass/README.md`, `Skills/Compliance.md`, and feature/pipeline examples in `Project_DTCC_AI_Hackathon/data-pipeline/processor/`.
- **Risks:** Models, serialized artifacts and training data are research material with possible class imbalance, temporal leakage, jurisdictional assumptions and concept drift. `OpenKYT` includes an LLM path; it cannot be used to determine blockchain truth. Model output needs calibration, explainability, validation on authorized data and human review.
- **License/data:** Apache-2.0 repository license with `NOTICE`; data/model provenance must be checked independently before use or redistribution, including sanction-source update rules.
- **Decision:** Later risk/reference work only. Do not make it a dependency or use pre-trained scores in the Phase 1 wallet investigation endpoint.

## Shared adoption rules

1. Do not copy a repository, its datasets or its generated artifacts wholesale into CASHNET.
2. Every imported fact, label and inference gets provenance: provider/dataset, `source_type`, source URL/reference, retrieval/import time, method, confidence, evidence and validation status.
3. A label or shared funding pattern may yield a candidate or inference, never a customer identity claim.
4. Preserve raw authorized provider payloads by immutable reference and content hash where policy permits; redact sensitive records from UI/logs.
5. Add record/replay fixtures and contract tests before enabling an adapter in non-synthetic mode.
