import { BlockchainTransactionSchema, ContractInteractionSchema, TokenTransferSchema, WalletSchema, type BlockchainTransaction, type ContractInteraction, type TokenTransfer, type Wallet } from "../../schemas/models";
import type { NormalizedTransactionBundle } from "./types";
import { apiProvenance } from "./normalizers";

/**
 * Solana-specific normalizer.
 *
 * Solana concepts mapped to CASHNET common model:
 *   signature → transactionHash
 *   slot → blockNumber
 *   blockTime → timestamp (seconds since epoch)
 *   account keys → from/to (first signer = from, first writable non-signer = to)
 *   fee → fee (lamports)
 *   program instructions → contract interactions
 *   SPL token transfers → token transfers
 *
 * Solana-native detail preserved in provenance.rawData:
 *   signature, slot, program_id, instruction_index, inner_instruction_index,
 *   account_keys, log_messages
 */

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown): string | undefined => value == null || value === "" ? undefined : String(value);
const isoNow = () => new Date().toISOString();
const isoFromSeconds = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : undefined;
};
const id = (prefix: string, value: string) => `${prefix}:SOLANA:${value}`;

type ParsedInstruction = { program?: string; programId?: string; parsed?: { type?: string; info?: UnknownRecord }; data?: string; accounts?: string[] };
type ParsedTransactionMeta = { err: unknown; fee: number; preBalances: number[]; postBalances: number[]; preTokenBalances?: unknown[]; postTokenBalances?: unknown[]; innerInstructions?: { index: number; instructions: ParsedInstruction[] }[]; logMessages?: string[] };
type ParsedTransaction = { signatures: string[]; message: { accountKeys: { pubkey: string; signer: boolean; writable: boolean }[]; instructions: ParsedInstruction[]; recentBlockhash: string } };
type SolanaTransactionResult = { slot: number; blockTime: number | null; transaction: ParsedTransaction; meta: ParsedTransactionMeta | null };

export function solanaWallet(address: string, lamports: number, raw: unknown): Wallet {
  return WalletSchema.parse({
    id: id("wallet", address),
    address,
    chain: "SOLANA",
    balance: String(lamports),
    balanceUnit: "lamport",
    createdAt: isoNow(),
    provenance: apiProvenance("solana-rpc", `solana://account/${address}`, raw),
  });
}

export function solanaTransaction(result: SolanaTransactionResult, signature: string): NormalizedTransactionBundle {
  const { transaction, meta, slot, blockTime } = result;
  const accountKeys = transaction.message.accountKeys;

  // First signer = sender (fee payer)
  const from = accountKeys.find((k) => k.signer)?.pubkey;
  // First writable non-signer = primary recipient (heuristic)
  const to = accountKeys.find((k) => k.writable && !k.signer)?.pubkey ?? accountKeys[1]?.pubkey;

  const fee = meta?.fee;
  const executionStatus = meta?.err ? "FAILED" : "SUCCESS";

  // Compute native SOL transfer value from balance changes
  let nativeValue: string | undefined;
  if (meta && from && to) {
    const fromIdx = accountKeys.findIndex((k) => k.pubkey === from);
    const toIdx = accountKeys.findIndex((k) => k.pubkey === to);
    if (fromIdx >= 0 && toIdx >= 0) {
      const received = (meta.postBalances[toIdx] ?? 0) - (meta.preBalances[toIdx] ?? 0);
      if (received > 0) nativeValue = String(received);
    }
  }

  // Preserve Solana-native detail in raw data
  const solanaRawData = {
    signature, slot, blockTime,
    account_keys: accountKeys.map((k) => ({ pubkey: k.pubkey, signer: k.signer, writable: k.writable })),
    instructions: transaction.message.instructions.map((inst, idx) => ({
      index: idx,
      program: inst.program ?? inst.programId,
      parsed_type: inst.parsed?.type,
      parsed_info: inst.parsed?.info,
    })),
    inner_instructions: meta?.innerInstructions?.map((ii) => ({
      index: ii.index,
      instructions: ii.instructions.map((inst, iIdx) => ({
        inner_index: iIdx,
        program: inst.program ?? inst.programId,
        parsed_type: inst.parsed?.type,
        parsed_info: inst.parsed?.info,
      })),
    })),
    log_messages: meta?.logMessages,
  };

  const tx: BlockchainTransaction = BlockchainTransactionSchema.parse({
    id: id("tx", signature),
    chain: "SOLANA",
    transactionHash: signature,
    createdAt: isoNow(),
    timestamp: isoFromSeconds(blockTime),
    blockNumber: String(slot),
    from, to,
    value: nativeValue,
    fee: fee != null ? String(fee) : undefined,
    executionStatus,
    inputs: [],
    outputs: [],
    provenance: apiProvenance("solana-rpc", `solana://tx/${signature}`, solanaRawData),
  });

  // Extract SPL token transfers from parsed instructions
  const tokenTransfers: TokenTransfer[] = [];
  const allInstructions: { instruction: ParsedInstruction; instrIndex: number; innerIndex?: number }[] = [];

  transaction.message.instructions.forEach((inst, idx) => {
    allInstructions.push({ instruction: inst, instrIndex: idx });
  });
  meta?.innerInstructions?.forEach((ii) => {
    ii.instructions.forEach((inst, iIdx) => {
      allInstructions.push({ instruction: inst, instrIndex: ii.index, innerIndex: iIdx });
    });
  });

  const contractInteractions: ContractInteraction[] = [];

  for (const { instruction: inst, instrIndex, innerIndex } of allInstructions) {
    const programId = inst.programId ?? inst.program;
    if (programId) {
      contractInteractions.push(ContractInteractionSchema.parse({
        id: id("interaction", `${signature}:${instrIndex}:${innerIndex ?? "top"}`),
        chain: "SOLANA",
        transactionHash: signature,
        contractAddress: programId,
        methodSelector: inst.parsed?.type,
        input: inst.data, // raw instruction data if available
        createdAt: isoNow(),
        provenance: apiProvenance("solana-rpc", `solana://instruction/${signature}/${instrIndex}/${innerIndex ?? "top"}`, {
          program_id: programId,
          instruction_index: instrIndex,
          inner_instruction_index: innerIndex,
          parsed_type: inst.parsed?.type,
          parsed_info: inst.parsed?.info,
        }),
      }));
    }

    if (!inst.parsed) continue;
    const info = inst.parsed.info;
    const type = inst.parsed.type;
    if (!info) continue;

    // SPL token transfer / transferChecked
    if ((type === "transfer" || type === "transferChecked") && inst.program === "spl-token") {
      const transferFrom = text(info.authority) ?? text(info.source);
      const transferTo = text(info.destination);
      const amount = text(info.amount) ?? text(info.tokenAmount && typeof info.tokenAmount === "object" ? (info.tokenAmount as UnknownRecord).amount : undefined);
      const mint = text(info.mint);
      if (transferFrom && transferTo && amount) {
        const transferId = id("transfer", `${signature}:${instrIndex}:${innerIndex ?? "top"}`);
        tokenTransfers.push(TokenTransferSchema.parse({
          id: transferId,
          chain: "SOLANA",
          transactionHash: signature,
          from: transferFrom,
          to: transferTo,
          asset: mint ?? "SPL",
          amount,
          contractAddress: mint,
          createdAt: isoNow(),
          provenance: apiProvenance("solana-rpc", `solana://transfer/${signature}/${instrIndex}/${innerIndex ?? "top"}`, {
            program_id: inst.programId ?? inst.program,
            instruction_index: instrIndex,
            inner_instruction_index: innerIndex,
            mint,
            parsed_type: type,
          }),
        }));
      }
    }

    // Native SOL transfer via system program
    if (type === "transfer" && inst.program === "system") {
      const transferFrom = text(info.source);
      const transferTo = text(info.destination);
      const lamportsValue = text(info.lamports);
      if (transferFrom && transferTo && lamportsValue) {
        const transferId = id("transfer", `${signature}:${instrIndex}:sol`);
        tokenTransfers.push(TokenTransferSchema.parse({
          id: transferId,
          chain: "SOLANA",
          transactionHash: signature,
          from: transferFrom,
          to: transferTo,
          asset: "SOL",
          amount: lamportsValue,
          createdAt: isoNow(),
          provenance: apiProvenance("solana-rpc", `solana://sol-transfer/${signature}/${instrIndex}`, {
            program_id: "system",
            instruction_index: instrIndex,
            inner_instruction_index: innerIndex,
          }),
        }));
      }
    }
  }

  return { transaction: tx, tokenTransfers, contractInteractions };
}

/** Extract token transfers from a Solana transaction result (convenience). */
export function solanaTokenTransfer(result: SolanaTransactionResult, signature: string): TokenTransfer[] {
  return solanaTransaction(result, signature).tokenTransfers;
}
