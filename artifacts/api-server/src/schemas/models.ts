import { z } from "zod";

export const SourceTypeSchema = z.enum(["SYNTHETIC", "USER_PROVIDED", "API", "RPC", "DATASET", "INFERENCE", "OTHER", "MODEL_INFERENCE"]);
export const ChainSchema = z.enum(["BITCOIN", "ETHEREUM", "TRON", "BNB_CHAIN", "POLYGON", "SOLANA", "OTHER"]);
export const ConfidenceSchema = z.number().min(0).max(1);

export const ProvenanceSchema = z.object({
  sourceType: SourceTypeSchema,
  provider: z.string().min(1),
  sourceReference: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  retrievedAt: z.string().datetime(),
  method: z.string().min(1),
  confidence: ConfidenceSchema.optional(),
  rawReference: z.string().min(1).optional(),
  rawData: z.unknown().optional(),
});

const IdentifiedSchema = z.object({ id: z.string().min(1), caseId: z.string().min(1).optional(), createdAt: z.string().datetime() });

export const CaseSchema = IdentifiedSchema.extend({ reference: z.string().min(1), title: z.string().min(1), status: z.string().min(1), provenance: ProvenanceSchema });
export const InvestigationSchema = IdentifiedSchema.extend({ status: z.string().min(1), requestedBy: z.string().min(1), startedAt: z.string().datetime().optional(), completedAt: z.string().datetime().optional(), provenance: ProvenanceSchema });
export const WalletSchema = IdentifiedSchema.extend({ address: z.string().min(1), chain: ChainSchema, balance: z.string().min(1).optional(), balanceUnit: z.string().min(1).optional(), provenance: ProvenanceSchema });
export const TransactionInputSchema = z.object({ index: z.number().int().nonnegative(), address: z.string().min(1).optional(), value: z.string().min(1).optional(), previousTransactionHash: z.string().min(1).optional(), previousOutputIndex: z.number().int().nonnegative().optional(), script: z.string().min(1).optional() });
export const TransactionOutputSchema = z.object({ index: z.number().int().nonnegative(), address: z.string().min(1).optional(), value: z.string().min(1), script: z.string().min(1).optional(), spentByTransactionHash: z.string().min(1).optional() });
export const BlockchainTransactionSchema = IdentifiedSchema.extend({ chain: ChainSchema, transactionHash: z.string().min(1), timestamp: z.string().datetime().optional(), blockNumber: z.string().min(1).optional(), blockHash: z.string().min(1).optional(), confirmations: z.number().int().nonnegative().optional(), from: z.string().min(1).optional(), to: z.string().min(1).optional(), value: z.string().min(1).optional(), fee: z.string().min(1).optional(), gas: z.string().min(1).optional(), gasPrice: z.string().min(1).optional(), gasUsed: z.string().min(1).optional(), input: z.string().optional(), methodSelector: z.string().optional(), functionName: z.string().optional(), executionStatus: z.enum(["SUCCESS", "FAILED", "PENDING", "UNKNOWN"]).optional(), inputs: z.array(TransactionInputSchema), outputs: z.array(TransactionOutputSchema), provenance: ProvenanceSchema });
export const TokenTransferSchema = IdentifiedSchema.extend({ chain: ChainSchema, transactionHash: z.string().min(1), from: z.string().min(1), to: z.string().min(1), asset: z.string().min(1), amount: z.string().min(1), contractAddress: z.string().min(1).optional(), provenance: ProvenanceSchema });
export const ContractInteractionSchema = IdentifiedSchema.extend({ chain: ChainSchema, transactionHash: z.string().min(1), contractAddress: z.string().min(1), methodSelector: z.string().min(1).optional(), input: z.string().optional(), provenance: ProvenanceSchema });
export const WalletRelationshipSchema = IdentifiedSchema.extend({ sourceWalletId: z.string().min(1), targetWalletId: z.string().min(1), relationshipType: z.string().min(1), transactionHash: z.string().min(1).optional(), provenance: ProvenanceSchema });
export const EntitySchema = IdentifiedSchema.extend({ name: z.string().min(1), entityType: z.string().min(1), provenance: ProvenanceSchema });
export const AddressLabelSchema = IdentifiedSchema.extend({ address: z.string().min(1), chain: ChainSchema, label: z.string().min(1), entityId: z.string().min(1).optional(), provenance: ProvenanceSchema, lastVerifiedAt: z.string().datetime().optional() });
export const VASPCandidateSchema = IdentifiedSchema.extend({ entityId: z.string().min(1).optional(), chain: ChainSchema, status: z.enum(["CONFIRMED", "LIKELY", "POSSIBLE", "UNKNOWN", "INSUFFICIENT_EVIDENCE"]), evidenceIds: z.array(z.string().min(1)), provenance: ProvenanceSchema });
export const EvidenceSchema = IdentifiedSchema.extend({ subjectType: z.string().min(1), subjectId: z.string().min(1), evidenceType: z.string().min(1), provenance: ProvenanceSchema });
export const RiskIndicatorSchema = IdentifiedSchema.extend({ name: z.string().min(1), severity: z.enum(["INSUFFICIENT_EVIDENCE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]), explanation: z.string().min(1), provenance: ProvenanceSchema });
export const InvestigationEventSchema = IdentifiedSchema.extend({ eventType: z.string().min(1), occurredAt: z.string().datetime(), provenance: ProvenanceSchema });
export const AuditEventSchema = IdentifiedSchema.extend({ actor: z.string().min(1), action: z.string().min(1), occurredAt: z.string().datetime(), provenance: ProvenanceSchema });

export type Case = z.infer<typeof CaseSchema>;
export type Investigation = z.infer<typeof InvestigationSchema>;
export type Wallet = z.infer<typeof WalletSchema>;
export type BlockchainTransaction = z.infer<typeof BlockchainTransactionSchema>;
export type TokenTransfer = z.infer<typeof TokenTransferSchema>;
export type ContractInteraction = z.infer<typeof ContractInteractionSchema>;
