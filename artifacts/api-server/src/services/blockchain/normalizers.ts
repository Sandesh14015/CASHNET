import { BlockchainTransactionSchema, ContractInteractionSchema, TokenTransferSchema, WalletSchema, type BlockchainTransaction, type ContractInteraction, type TokenTransfer, type Wallet } from "../../schemas/models";
import type { NormalizedTransactionBundle } from "./types";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const string = (value: unknown): string | undefined => value == null || value === "" ? undefined : String(value);
const dateFromSeconds = (value: unknown) => { const raw = string(value); return raw && /^\d+$/.test(raw) ? new Date(Number(raw) * 1000).toISOString() : undefined; };
const isoNow = () => new Date().toISOString();
const id = (prefix: string, chain: string, value: string) => `${prefix}:${chain}:${value}`;
export const apiProvenance = (provider: string, reference: string, raw: unknown) => ({ sourceType: "API" as const, provider, sourceReference: reference, rawReference: reference, retrievedAt: isoNow(), method: "server-side HTTP adapter", rawData: raw });

export function evmWallet(address: string, balance: unknown, raw: unknown): Wallet {
  return WalletSchema.parse({ id: id("wallet", "ETHEREUM", address.toLowerCase()), address, chain: "ETHEREUM", balance: String(balance ?? "0"), balanceUnit: "wei", createdAt: isoNow(), provenance: apiProvenance("etherscan-v2", `etherscan://account/${address}`, raw) });
}
export function evmTransaction(rawValue: unknown, kind = "normal"): NormalizedTransactionBundle {
  const raw = record(rawValue); const hash = string(raw.hash) ?? string(raw.transactionHash) ?? "unknown"; const from = string(raw.from); const to = string(raw.to);
  const tx: BlockchainTransaction = BlockchainTransactionSchema.parse({ id: id("tx", "ETHEREUM", hash), chain: "ETHEREUM", transactionHash: hash, createdAt: isoNow(), timestamp: dateFromSeconds(raw.timeStamp), blockNumber: string(raw.blockNumber), blockHash: string(raw.blockHash), confirmations: string(raw.confirmations) ? Number(raw.confirmations) : undefined, from, to, value: string(raw.value), fee: string(raw.gasUsed) && string(raw.gasPrice) ? String(BigInt(String(raw.gasUsed)) * BigInt(String(raw.gasPrice))) : undefined, gas: string(raw.gas), gasPrice: string(raw.gasPrice), gasUsed: string(raw.gasUsed), input: string(raw.input), methodSelector: string(raw.methodId) ?? (string(raw.input)?.slice(0, 10)), functionName: string(raw.functionName), executionStatus: raw.isError === "1" || raw.txreceipt_status === "0" ? "FAILED" : raw.blockNumber ? "SUCCESS" : "PENDING", inputs: [], outputs: [], provenance: apiProvenance("etherscan-v2", `etherscan://transaction/${hash}/${kind}`, raw) });
  const transfers: TokenTransfer[] = kind === "token" && from && to && string(raw.tokenSymbol) && string(raw.value) ? [TokenTransferSchema.parse({ id: id("transfer", "ETHEREUM", `${hash}:${from}:${to}:${raw.contractAddress ?? "native"}`), chain: "ETHEREUM", transactionHash: hash, from, to, asset: String(raw.tokenSymbol), amount: String(raw.value), contractAddress: string(raw.contractAddress), createdAt: isoNow(), provenance: apiProvenance("etherscan-v2", `etherscan://token-transfer/${hash}`, raw) })] : [];
  const interactions: ContractInteraction[] = to && string(raw.input) && string(raw.input) !== "0x" ? [ContractInteractionSchema.parse({ id: id("interaction", "ETHEREUM", `${hash}:${to}`), chain: "ETHEREUM", transactionHash: hash, contractAddress: to, methodSelector: string(raw.methodId) ?? string(raw.input)?.slice(0, 10), input: string(raw.input), createdAt: isoNow(), provenance: apiProvenance("etherscan-v2", `etherscan://contract/${hash}`, raw) })] : [];
  return { transaction: tx, tokenTransfers: transfers, contractInteractions: interactions };
}
export function bitcoinWallet(address: string, raw: unknown): Wallet {
  const stats = record(record(raw).chain_stats); const mempool = record(record(raw).mempool_stats); const balance = Number(stats.funded_txo_sum ?? 0) - Number(stats.spent_txo_sum ?? 0) + Number(mempool.funded_txo_sum ?? 0) - Number(mempool.spent_txo_sum ?? 0);
  return WalletSchema.parse({ id: id("wallet", "BITCOIN", address), address, chain: "BITCOIN", balance: String(balance), balanceUnit: "satoshi", createdAt: isoNow(), provenance: apiProvenance("blockstream-esplora", `esplora://address/${address}`, raw) });
}
export function bitcoinTransaction(rawValue: unknown): NormalizedTransactionBundle {
  const raw = record(rawValue); const hash = string(raw.txid) ?? "unknown"; const status = record(raw.status); const vin = Array.isArray(raw.vin) ? raw.vin : []; const vout = Array.isArray(raw.vout) ? raw.vout : [];
  return { transaction: BlockchainTransactionSchema.parse({ id: id("tx", "BITCOIN", hash), chain: "BITCOIN", transactionHash: hash, createdAt: isoNow(), timestamp: dateFromSeconds(status.block_time), blockNumber: string(status.block_height), blockHash: string(status.block_hash), fee: string(raw.fee), executionStatus: status.confirmed === true ? "SUCCESS" : "PENDING", inputs: vin.map((input, index) => { const item = record(input); const prev = record(item.prevout); return { index, address: string(prev.scriptpubkey_address), value: string(prev.value), previousTransactionHash: string(item.txid), previousOutputIndex: typeof item.vout === "number" ? item.vout : undefined, script: string(prev.scriptpubkey) }; }), outputs: vout.map((output, index) => { const item = record(output); return { index, address: string(item.scriptpubkey_address), value: String(item.value ?? "0"), script: string(item.scriptpubkey) }; }), provenance: apiProvenance("blockstream-esplora", `esplora://tx/${hash}`, raw) }), tokenTransfers: [], contractInteractions: [] };
}
export function tronWallet(address: string, raw: unknown): Wallet { return WalletSchema.parse({ id: id("wallet", "TRON", address), address, chain: "TRON", balance: String(record(raw).balance ?? "0"), balanceUnit: "sun", createdAt: isoNow(), provenance: apiProvenance("trongrid", `trongrid://account/${address}`, raw) }); }
export function tronTransaction(rawValue: unknown): NormalizedTransactionBundle {
  const raw = record(rawValue); const hash = string(raw.txID) ?? string(raw.transaction_id) ?? "unknown"; const rawData = record(raw.raw_data); const contracts = Array.isArray(rawData.contract) ? rawData.contract : []; const first = record(contracts[0]); const parameter = record(record(first.parameter).value); const from = string(parameter.owner_address) ?? string(raw.from); const to = string(parameter.to_address) ?? string(raw.to); const returns = Array.isArray(raw.ret) ? raw.ret : []; const receipt = record(returns[0]);
  const tx = BlockchainTransactionSchema.parse({ id: id("tx", "TRON", hash), chain: "TRON", transactionHash: hash, createdAt: isoNow(), timestamp: dateFromSeconds(Number(raw.block_timestamp ?? 0) / 1000), blockNumber: string(raw.block_number), from, to, value: string(parameter.amount) ?? string(raw.value), input: string(parameter.data), executionStatus: receipt.contractRet === "SUCCESS" ? "SUCCESS" : raw.block_number ? "UNKNOWN" : "PENDING", inputs: [], outputs: [], provenance: apiProvenance("trongrid", `trongrid://transaction/${hash}`, raw) });
  return { transaction: tx, tokenTransfers: [], contractInteractions: [] };
}
export function tronTokenTransfer(rawValue: unknown): TokenTransfer | null { const raw = record(rawValue); const hash = string(raw.transaction_id); const from = string(raw.from); const to = string(raw.to); const token = record(raw.token_info); if (!hash || !from || !to || !string(raw.value)) return null; return TokenTransferSchema.parse({ id: id("transfer", "TRON", `${hash}:${from}:${to}:${string(token.address) ?? "trc20"}`), chain: "TRON", transactionHash: hash, from, to, asset: string(token.symbol) ?? "TRC20", amount: String(raw.value), contractAddress: string(token.address), createdAt: isoNow(), provenance: apiProvenance("trongrid", `trongrid://trc20/${hash}`, raw) }); }

// ── BNB Chain (NodeReal) normalizers ─────────────────────────────────────────
// NodeReal MegaNode API uses JSON-RPC (eth_*, nr_getAssetTransfers).

export function noderealBnbWallet(address: string, balanceHex: unknown, raw: unknown): Wallet {
  const balance = typeof balanceHex === "string" && balanceHex.startsWith("0x") ? BigInt(balanceHex).toString(10) : "0";
  return WalletSchema.parse({ id: id("wallet", "BNB_CHAIN", address.toLowerCase()), address, chain: "BNB_CHAIN", balance, balanceUnit: "wei", createdAt: isoNow(), provenance: apiProvenance("nodereal", `nodereal://account/${address}`, raw) });
}

export function noderealBnbTransaction(rawValue: unknown, kind = "normal"): NormalizedTransactionBundle {
  const raw = record(rawValue); const hash = string(raw.hash) ?? string(raw.transactionHash) ?? "unknown"; const from = string(raw.from); const to = string(raw.to);
  // NodeReal uses hex strings for most JSON-RPC outputs.
  const toBase10 = (hex?: string) => hex && hex.startsWith("0x") ? BigInt(hex).toString(10) : undefined;

  // If timestamp is not provided by eth_getTransactionByHash, we might not have it.
  // nr_getAssetTransfers provides blockTimestamp. Let's look for both.
  const timestampRaw = string(raw.blockTimestamp) || (raw.timestamp ? String(raw.timestamp) : undefined);
  const timestamp = timestampRaw && timestampRaw.startsWith("0x") ? dateFromSeconds(toBase10(timestampRaw)) : timestampRaw ? dateFromSeconds(timestampRaw) : undefined;

  const value = toBase10(string(raw.value));
  const gas = toBase10(string(raw.gas));
  const gasPrice = toBase10(string(raw.gasPrice));
  const gasUsed = toBase10(string(raw.gasUsed));

  const tx: BlockchainTransaction = BlockchainTransactionSchema.parse({
    id: id("tx", "BNB_CHAIN", hash),
    chain: "BNB_CHAIN",
    transactionHash: hash,
    createdAt: isoNow(),
    timestamp,
    blockNumber: toBase10(string(raw.blockNumber) ?? string(raw.blockNum)),
    blockHash: string(raw.blockHash),
    from,
    to,
    value,
    fee: gasUsed && gasPrice ? String(BigInt(gasUsed) * BigInt(gasPrice)) : undefined,
    gas,
    gasPrice,
    gasUsed,
    input: string(raw.input),
    methodSelector: string(raw.input)?.slice(0, 10),
    executionStatus: raw.receiptsStatus === 1 || raw.status === "0x1" || raw.blockNumber ? "SUCCESS" : "PENDING",
    inputs: [],
    outputs: [],
    provenance: apiProvenance("nodereal", `nodereal://transaction/${hash}/${kind}`, raw)
  });

  const transfers: TokenTransfer[] = kind === "token" && from && to && string(raw.asset) && string(raw.value) ? [TokenTransferSchema.parse({ id: id("transfer", "BNB_CHAIN", `${hash}:${from}:${to}:${raw.contractAddress ?? "native"}`), chain: "BNB_CHAIN", transactionHash: hash, from, to, asset: String(raw.asset), amount: toBase10(String(raw.value)) ?? "0", contractAddress: string(raw.contractAddress), createdAt: isoNow(), provenance: apiProvenance("nodereal", `nodereal://token-transfer/${hash}`, raw) })] : [];
  const interactions: ContractInteraction[] = to && string(raw.input) && string(raw.input) !== "0x" ? [ContractInteractionSchema.parse({ id: id("interaction", "BNB_CHAIN", `${hash}:${to}`), chain: "BNB_CHAIN", transactionHash: hash, contractAddress: to, methodSelector: string(raw.input)?.slice(0, 10), input: string(raw.input), createdAt: isoNow(), provenance: apiProvenance("nodereal", `nodereal://contract/${hash}`, raw) })] : [];

  return { transaction: tx, tokenTransfers: transfers, contractInteractions: interactions };
}

export function noderealBnbTokenTransfer(rawValue: unknown): TokenTransfer | null {
  const raw = record(rawValue); const hash = string(raw.hash) ?? string(raw.transactionHash); const from = string(raw.from); const to = string(raw.to);
  const toBase10 = (hex?: string) => hex && hex.startsWith("0x") ? BigInt(hex).toString(10) : undefined;

  if (!hash || !from || !to || !string(raw.value) || !string(raw.asset)) return null;
  return TokenTransferSchema.parse({ id: id("transfer", "BNB_CHAIN", `${hash}:${from}:${to}:${raw.contractAddress ?? "bep20"}`), chain: "BNB_CHAIN", transactionHash: hash, from, to, asset: String(raw.asset), amount: toBase10(String(raw.value)) ?? "0", contractAddress: string(raw.contractAddress), createdAt: isoNow(), provenance: apiProvenance("nodereal", `nodereal://bep20/${hash}`, raw) });
}

// ── Polygon (Blockscout) normalizers ─────────────────────────────────────────
// Reuses the EVM normalization patterns for Blockscout's Etherscan-compatible API.

export function blockscoutPolygonWallet(address: string, balance: unknown, raw: unknown): Wallet {
  return WalletSchema.parse({ id: id("wallet", "POLYGON", address.toLowerCase()), address, chain: "POLYGON", balance: String(balance ?? "0"), balanceUnit: "wei", createdAt: isoNow(), provenance: apiProvenance("blockscout", `blockscout://account/${address}`, raw) });
}

export function blockscoutPolygonTransaction(rawValue: unknown, kind = "normal"): NormalizedTransactionBundle {
  const raw = record(rawValue); const hash = string(raw.hash) ?? string(raw.transactionHash) ?? "unknown"; const from = string(raw.from); const to = string(raw.to);
  const tx: BlockchainTransaction = BlockchainTransactionSchema.parse({ id: id("tx", "POLYGON", hash), chain: "POLYGON", transactionHash: hash, createdAt: isoNow(), timestamp: dateFromSeconds(raw.timeStamp), blockNumber: string(raw.blockNumber), blockHash: string(raw.blockHash), confirmations: string(raw.confirmations) ? Number(raw.confirmations) : undefined, from, to, value: string(raw.value), fee: string(raw.gasUsed) && string(raw.gasPrice) ? String(BigInt(String(raw.gasUsed)) * BigInt(String(raw.gasPrice))) : undefined, gas: string(raw.gas), gasPrice: string(raw.gasPrice), gasUsed: string(raw.gasUsed), input: string(raw.input), methodSelector: string(raw.methodId) ?? (string(raw.input)?.slice(0, 10)), functionName: string(raw.functionName), executionStatus: raw.isError === "1" || raw.txreceipt_status === "0" ? "FAILED" : raw.blockNumber ? "SUCCESS" : "PENDING", inputs: [], outputs: [], provenance: apiProvenance("blockscout", `blockscout://transaction/${hash}/${kind}`, raw) });
  const transfers: TokenTransfer[] = kind === "token" && from && to && string(raw.tokenSymbol) && string(raw.value) ? [TokenTransferSchema.parse({ id: id("transfer", "POLYGON", `${hash}:${from}:${to}:${raw.contractAddress ?? "native"}`), chain: "POLYGON", transactionHash: hash, from, to, asset: String(raw.tokenSymbol), amount: String(raw.value), contractAddress: string(raw.contractAddress), createdAt: isoNow(), provenance: apiProvenance("blockscout", `blockscout://token-transfer/${hash}`, raw) })] : [];
  const interactions: ContractInteraction[] = to && string(raw.input) && string(raw.input) !== "0x" ? [ContractInteractionSchema.parse({ id: id("interaction", "POLYGON", `${hash}:${to}`), chain: "POLYGON", transactionHash: hash, contractAddress: to, methodSelector: string(raw.methodId) ?? string(raw.input)?.slice(0, 10), input: string(raw.input), createdAt: isoNow(), provenance: apiProvenance("blockscout", `blockscout://contract/${hash}`, raw) })] : [];
  return { transaction: tx, tokenTransfers: transfers, contractInteractions: interactions };
}

export function blockscoutPolygonTokenTransfer(rawValue: unknown): TokenTransfer | null {
  const raw = record(rawValue); const hash = string(raw.hash) ?? string(raw.transactionHash); const from = string(raw.from); const to = string(raw.to);
  if (!hash || !from || !to || !string(raw.value) || !string(raw.tokenSymbol)) return null;
  return TokenTransferSchema.parse({ id: id("transfer", "POLYGON", `${hash}:${from}:${to}:${raw.contractAddress ?? "erc20"}`), chain: "POLYGON", transactionHash: hash, from, to, asset: String(raw.tokenSymbol), amount: String(raw.value), contractAddress: string(raw.contractAddress), createdAt: isoNow(), provenance: apiProvenance("blockscout", `blockscout://erc20/${hash}`, raw) });
}
