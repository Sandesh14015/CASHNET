# CASHNET Phase 6 — Provider Matrix

## Provider Selection Criteria

Each provider must be:

1. **Legitimate** — official or established API with stable contracts
2. **Documented** — published API reference
3. **Adequate** — covers required data types for forensic investigation
4. **Rate-limited safely** — known limits, backoff strategy possible
5. **Paginated** — handles addresses with large transaction history

## Provider Matrix

| Chain | Provider | API Base | Auth | Rate Limit | Pagination | License/Terms |
|---|---|---|---|---|---|---|
| Bitcoin | Blockstream Esplora | `blockstream.info/api` | None | Moderate | Cursor-based | Open |
| Ethereum | Etherscan V2 | `api.etherscan.io/v2` | API key | 5 req/s (free) | Offset-based | Terms |
| TRON | TronGrid | `api.trongrid.io` | API key | Moderate | Fingerprint-based | Terms |
| BNB Chain | BscScan | `api.bscscan.com/api` | API key | 5 req/s (free) | Offset-based | Terms |
| Polygon | PolygonScan | `api.polygonscan.com/api` | API key | 5 req/s (free) | Offset-based | Terms |
| Solana | Solana RPC | `api.mainnet-beta.solana.com` | None (public) | Throttled | Cursor-based | Open |

## Provider-Specific Behavior (Independently Verified)

### BscScan (BNB Chain)

BscScan uses the Etherscan API contract but differences MUST be verified:

| Aspect | Verification Required |
|---|---|
| Endpoint paths | Confirm `module=account`, `action=txlist` etc. work identically |
| Response schema | Verify field names, types, and presence match Etherscan |
| Rate limits | Verify free-tier rate limits (may differ from Etherscan) |
| Pagination | Verify `startblock`/`endblock`/`page`/`offset` behavior |
| Error semantics | Verify error response format and codes |
| Internal transactions | Verify `action=txlistinternal` availability and schema |
| Token transfers | Verify `action=tokentx` response schema |
| Historical data | Verify data availability for older blocks |
| Chain ID | BNB Chain = 56 (mainnet) |
| Native asset | BNB (not ETH) |
| Balance unit | wei (18 decimals, same as ETH) |

### PolygonScan (Polygon)

| Aspect | Verification Required |
|---|---|
| Endpoint paths | Confirm standard Etherscan API contract |
| Response schema | Verify field compatibility |
| Rate limits | Verify free-tier limits |
| Pagination | Verify behavior matches |
| Error semantics | Verify error format |
| Native asset | POL (formerly MATIC) |
| Balance unit | wei (18 decimals) |
| Chain ID | 137 (mainnet) |
| Token standard | ERC-20 (same as Ethereum) |
| Historical data | Verify availability depth |

### Solana RPC

Solana uses a completely different API model:

| Aspect | Design |
|---|---|
| Protocol | JSON-RPC 2.0 over HTTPS |
| Transaction history | `getSignaturesForAddress` (returns signatures, not full txs) |
| Transaction detail | `getTransaction` (per-signature lookup) |
| Account info | `getAccountInfo` (balance, owner, data) |
| SPL tokens | `getTokenAccountsByOwner` (token accounts) |
| Block time | `getBlockTime` (per-slot) |
| Pagination | `before` cursor (last signature) |
| Rate limits | Public RPC has undocumented throttling |
| Indexed provider | Helius/QuickNode for enhanced historical queries (optional) |

Solana data model differences:

| Ethereum Concept | Solana Equivalent |
|---|---|
| Transaction hash | Signature (base58) |
| Block number | Slot |
| From/To | Account keys (multi-account) |
| Contract interaction | Program instruction |
| Internal transaction | Inner instruction |
| ERC-20 transfer | SPL token transfer |
| Gas/fee | Fee (lamports) |
| Address format | Base58 (32-byte public key) |

## Address Validation

| Chain | Format | Validation |
|---|---|---|
| Bitcoin | Base58Check or Bech32 | Existing Esplora validation |
| Ethereum | 0x + 40 hex chars | EIP-55 checksum (optional) |
| TRON | T + Base58Check (34 chars) | Existing TronGrid validation |
| BNB Chain | 0x + 40 hex chars | Same as Ethereum |
| Polygon | 0x + 40 hex chars | Same as Ethereum |
| Solana | Base58 (32-44 chars) | Ed25519 public key validation |

## Provider Configuration

| Env Variable | Chain | Required |
|---|---|---|
| `BITCOIN_ESPLORA_BASE_URL` | Bitcoin | No (default: blockstream.info) |
| `ETHERSCAN_API_KEY` | Ethereum | Yes (for authorized mode) |
| `TRONGRID_API_KEY` | TRON | Yes (for authorized mode) |
| `BSCSCAN_API_KEY` | BNB Chain | Yes (for authorized mode) |
| `POLYGONSCAN_API_KEY` | Polygon | Yes (for authorized mode) |
| `SOLANA_RPC_URL` | Solana | No (default: public mainnet) |
| `SOLANA_API_KEY` | Solana | No (public RPC is keyless) |

## Provenance Requirements

Every provider response must preserve:

| Field | Source |
|---|---|
| `sourceType` | `"API"` or `"RPC"` |
| `provider` | Provider name (e.g., `bscscan`, `polygonscan`, `solana-rpc`) |
| `sourceReference` | Provider-specific reference URI |
| `rawReference` | Same as sourceReference |
| `retrievedAt` | ISO 8601 timestamp of retrieval |
| `method` | `"server-side HTTP adapter"` |
| `rawData` | Original provider response (stored as JSONB) |
