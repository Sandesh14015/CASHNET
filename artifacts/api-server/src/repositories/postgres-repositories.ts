import { sql } from "drizzle-orm";
import type { CashnetDatabase } from "@workspace/db";
import type { AuditRepository } from "./audit-repository";
import type { CaseRepository } from "./case-repository";
import type { EvidenceRepository } from "./evidence-repository";
import type { InvestigationRepository } from "./investigation-repository";
import type { RepositoryContext, TransactionCoordinator } from "./repository-context";
import type { UserRepository } from "./user-repository";
import type { WalletSubjectRepository } from "./wallet-subject-repository";
import type { BlockchainRepository, PersistedBlockchainBundle } from "./blockchain-repository";
import type { GraphRepository } from "./graph-repository";
import type { IntelligenceRepository } from "./intelligence-repository";
import type { AnalyticsRepository } from "./analytics-repository";
import type { Actor, AddressIntelligenceObservationInput, AddressIntelligenceObservationRecord, AttributionReviewInput, AttributionReviewRecord, AuditEventRecord, BitcoinTransactionRecord, CaseRecord, ClusterInferenceInput, ClusterInferenceRecord, ClusterMember, CommunityPersistenceInput, CommunityRunRecord, DeFiInteractionPersistenceInput, EvidenceRecord, ForensicReportPersistenceInput, ForensicReportRecord, GraphFeaturePersistenceInput, GraphRelationshipInput, GraphRelationshipRecord, InvestigationRecord, MevCandidatePersistenceInput, PersistedGraphFeature, PersistedRiskIndicator, RiskAnalysisRunRecord, RiskIndicatorPersistenceInput, ServiceAddressAssessmentInput, ServiceAddressAssessmentRecord, VaspCandidateInput, VaspCandidateRecord, WalletSubjectRecord } from "./types";
import { extractRelationships } from "../services/graph/relationship-extractor";

type Executor = Pick<CashnetDatabase, "execute">;
const iso = (value: unknown): string | null => value == null ? null : new Date(String(value)).toISOString();
const text = (value: unknown): string => String(value);
const hasAdminRole = (actor: Actor) => actor.roles.includes("ADMIN");

function caseRecord(row: Record<string, unknown>): CaseRecord {
  return { id: text(row.id), caseNumber: text(row.case_reference), title: text(row.title), description: text(row.description), fraudType: text(row.fraud_type), reportedAmount: text(row.reported_amount), status: row.status as CaseRecord["status"], priority: text(row.priority), investigationAuthorizationStatus: row.investigation_authorization_status as CaseRecord["investigationAuthorizationStatus"], createdBy: row.created_by == null ? null : text(row.created_by), assignedTo: row.assigned_to == null ? null : text(row.assigned_to), closedAt: iso(row.closed_at), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function investigationRecord(row: Record<string, unknown>): InvestigationRecord {
  return { id: text(row.id), caseId: text(row.case_id), status: row.status as InvestigationRecord["status"], chain: row.chain == null ? null : text(row.chain), walletAddress: row.wallet_address == null ? null : text(row.wallet_address), investigationDepth: Number(row.investigation_depth), startTime: iso(row.start_time), endTime: iso(row.end_time), createdBy: row.created_by == null ? null : text(row.created_by), createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function evidenceRecord(row: Record<string, unknown>): EvidenceRecord {
  return { id: text(row.id), caseId: row.case_id == null ? null : text(row.case_id), investigationId: row.investigation_id == null ? null : text(row.investigation_id), subjectType: text(row.subject_type), subjectId: text(row.subject_id), evidenceType: text(row.evidence_type), sourceType: text(row.source_type), provider: row.provider == null ? null : text(row.provider), sourceReference: row.source_reference == null ? null : text(row.source_reference), sourceUrl: row.source_url == null ? null : text(row.source_url), observedAt: iso(row.observed_at), collectedAt: iso(row.collected_at), method: row.method == null ? null : text(row.method), confidence: row.confidence == null ? null : Number(row.confidence), rawReference: row.raw_reference == null ? null : text(row.raw_reference), contentHash: row.content_hash == null ? null : text(row.content_hash), description: row.description == null ? null : text(row.description), createdBy: row.created_by == null ? null : text(row.created_by), createdAt: iso(row.created_at)! };
}
function auditRecord(row: Record<string, unknown>): AuditEventRecord {
  return { id: text(row.id), caseId: row.case_id == null ? null : text(row.case_id), actorId: row.actor_id == null ? null : text(row.actor_id), action: text(row.action), resourceType: text(row.resource_type), resourceId: row.resource_id == null ? null : text(row.resource_id), requestId: row.request_id == null ? null : text(row.request_id), result: row.result as AuditEventRecord["result"], metadata: (row.metadata as Record<string, unknown>) ?? {}, createdAt: iso(row.created_at)! };
}
function graphRelationshipRecord(row: Record<string, unknown>): GraphRelationshipRecord {
  return { id: text(row.id), caseId: text(row.case_id), chain: text(row.chain), transactionHash: text(row.transaction_hash), fromAddress: text(row.from_address), toAddress: text(row.to_address), relationshipType: row.relationship_type as GraphRelationshipRecord["relationshipType"], asset: text(row.asset), amount: text(row.amount_numeric), tokenContract: row.token_contract == null ? null : text(row.token_contract), blockNumber: row.block_number == null ? null : text(row.block_number), timestamp: iso(row.block_timestamp), executionStatus: row.execution_status == null ? null : text(row.execution_status), derivationSourceType: row.derivation_source_type as GraphRelationshipRecord["derivationSourceType"], provider: row.provider == null ? null : text(row.provider), sourceReference: row.source_reference == null ? null : text(row.source_reference), rawReference: row.raw_reference == null ? null : text(row.raw_reference), retrievedAt: iso(row.retrieved_at), method: text(row.method), createdAt: iso(row.created_at)! };
}
function addressObservationRecord(row: Record<string, unknown>): AddressIntelligenceObservationRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: text(row.address), label: row.label == null ? null : text(row.label), entityName: row.entity_name == null ? null : text(row.entity_name), entityType: row.entity_type as AddressIntelligenceObservationRecord["entityType"], source: text(row.source), sourceReference: row.source_reference == null ? null : text(row.source_reference), sourceUrl: row.source_url == null ? null : text(row.source_url), datasetName: row.dataset_name == null ? null : text(row.dataset_name), datasetVersion: row.dataset_version == null ? null : text(row.dataset_version), license: row.license == null ? null : text(row.license), retrievedAt: iso(row.retrieved_at)!, lastVerified: iso(row.last_verified), freshnessStatus: row.freshness_status as AddressIntelligenceObservationRecord["freshnessStatus"], confidence: Number(row.confidence), status: row.status as AddressIntelligenceObservationRecord["status"], rawReference: row.raw_reference == null ? null : text(row.raw_reference), rawData: row.raw_data as Record<string, unknown> | null, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function clusterRecord(row: Record<string, unknown>, members: ClusterMember[] = []): ClusterInferenceRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), clusterKey: text(row.cluster_key), chain: "BITCOIN", method: text(row.method), methodVersion: text(row.method_version), confidenceLevel: row.confidence_level as ClusterInferenceRecord["confidenceLevel"], numericScore: Number(row.numeric_score), reviewStatus: row.review_status as ClusterInferenceRecord["reviewStatus"], ambiguityReason: row.ambiguity_reason == null ? null : text(row.ambiguity_reason), evidence: (row.evidence as Record<string, unknown>[]) ?? [], members, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function serviceAssessmentRecord(row: Record<string, unknown>): ServiceAddressAssessmentRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: text(row.address), classification: row.classification as ServiceAddressAssessmentRecord["classification"], confidenceLevel: row.confidence_level as ServiceAddressAssessmentRecord["confidenceLevel"], numericScore: Number(row.numeric_score), status: row.status as ServiceAddressAssessmentRecord["status"], signals: (row.signals as Record<string, unknown>[]) ?? [], createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function candidateRecord(row: Record<string, unknown>, evidence: VaspCandidateRecord["evidence"] = []): VaspCandidateRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: text(row.address), entityName: row.entity_name == null ? null : text(row.entity_name), entityType: row.entity_type as VaspCandidateRecord["entityType"], confidenceLevel: row.confidence_level as VaspCandidateRecord["confidenceLevel"], numericScore: Number(row.numeric_score), status: row.status as VaspCandidateRecord["status"], reason: text(row.reason), contradictions: (row.contradictions as Record<string, unknown>[]) ?? [], method: text(row.method), methodVersion: text(row.method_version), evidence, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)! };
}
function reviewRecord(row: Record<string, unknown>): AttributionReviewRecord { return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), candidateId: text(row.candidate_id), reviewerId: text(row.reviewer_id), decision: row.decision as AttributionReviewRecord["decision"], rationale: row.rationale == null ? null : text(row.rationale), createdAt: iso(row.created_at)! }; }

class PostgresCaseRepository implements CaseRepository {
  constructor(private readonly db: Executor) {}
  async findAccessibleById(actor: Actor, caseId: string) {
    const result = await this.db.execute(sql`select c.* from cases c where c.id = ${caseId} and (${hasAdminRole(actor)} or exists (select 1 from case_memberships cm where cm.case_id = c.id and cm.user_id = ${actor.id}))`);
    return result.rows[0] ? caseRecord(result.rows[0] as Record<string, unknown>) : null;
  }
  async listAccessible(actor: Actor) {
    const result = await this.db.execute(sql`select c.* from cases c where (${hasAdminRole(actor)} or exists (select 1 from case_memberships cm where cm.case_id = c.id and cm.user_id = ${actor.id})) order by c.created_at desc`);
    return result.rows.map((row) => caseRecord(row as Record<string, unknown>));
  }
  async create(input: Omit<CaseRecord, "id" | "createdAt" | "updatedAt" | "closedAt">) {
    const result = await this.db.execute(sql`insert into cases (case_reference, title, description, fraud_type, reported_amount, status, priority, investigation_authorization_status, created_by, assigned_to) values (${input.caseNumber}, ${input.title}, ${input.description}, ${input.fraudType}, ${input.reportedAmount}, ${input.status}, ${input.priority}, ${input.investigationAuthorizationStatus}, ${input.createdBy}::uuid, ${input.assignedTo}::uuid) returning *`);
    return caseRecord(result.rows[0] as Record<string, unknown>);
  }
  async update(caseId: string, patch: Parameters<CaseRepository["update"]>[1]) {
    const hasAssignedTo = Object.hasOwn(patch, "assignedTo");
    const hasClosedAt = Object.hasOwn(patch, "closedAt");
    const result = await this.db.execute(sql`update cases set title = coalesce(${patch.title ?? null}, title), description = coalesce(${patch.description ?? null}, description), priority = coalesce(${patch.priority ?? null}, priority), status = coalesce(${patch.status ?? null}, status), investigation_authorization_status = coalesce(${patch.investigationAuthorizationStatus ?? null}, investigation_authorization_status), assigned_to = case when ${hasAssignedTo} then ${patch.assignedTo ?? null}::uuid else assigned_to end, closed_at = case when ${hasClosedAt} then ${patch.closedAt ?? null}::timestamptz else closed_at end, updated_at = now() where id = ${caseId} returning *`);
    return result.rows[0] ? caseRecord(result.rows[0] as Record<string, unknown>) : null;
  }
  async addMember(caseId: string, userId: string) { await this.db.execute(sql`insert into case_memberships (case_id, user_id) values (${caseId}::uuid, ${userId}::uuid) on conflict do nothing`); }
  async isMember(caseId: string, userId: string) { const result = await this.db.execute(sql`select 1 from case_memberships where case_id = ${caseId}::uuid and user_id = ${userId}::uuid`); return result.rows.length > 0; }
}

class PostgresInvestigationRepository implements InvestigationRepository {
  constructor(private readonly db: Executor) {}
  async findAccessibleById(actor: Actor, investigationId: string) {
    const result = await this.db.execute(sql`select i.* from investigations i join cases c on c.id = i.case_id where i.id = ${investigationId} and (${hasAdminRole(actor)} or exists (select 1 from case_memberships cm where cm.case_id = c.id and cm.user_id = ${actor.id}))`);
    return result.rows[0] ? investigationRecord(result.rows[0] as Record<string, unknown>) : null;
  }
  async create(input: Omit<InvestigationRecord, "id" | "createdAt" | "updatedAt">) {
    const result = await this.db.execute(sql`insert into investigations (case_id, status, requested_by, source_type, chain, wallet_address, investigation_depth, start_time, end_time, created_by) values (${input.caseId}::uuid, ${input.status}, ${input.createdBy ?? "system"}, 'USER_PROVIDED', ${input.chain}, ${input.walletAddress}, ${input.investigationDepth}, ${input.startTime}::timestamptz, ${input.endTime}::timestamptz, ${input.createdBy}::uuid) returning *`);
    return investigationRecord(result.rows[0] as Record<string, unknown>);
  }
  async updateStatus(investigationId: string, status: InvestigationRecord["status"], authorizedBy?: string) {
    const result = await this.db.execute(sql`update investigations set status = ${status}, authorized_by = case when ${authorizedBy != null} then ${authorizedBy ?? null}::uuid else authorized_by end, authorized_at = case when ${status === "AUTHORIZED"} then now() else authorized_at end, completed_at = case when ${["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(status)} then now() else completed_at end, updated_at = now() where id = ${investigationId} returning *`);
    return result.rows[0] ? investigationRecord(result.rows[0] as Record<string, unknown>) : null;
  }
}

class PostgresWalletSubjectRepository implements WalletSubjectRepository {
  constructor(private readonly db: Executor) {}
  async create(input: Omit<WalletSubjectRecord, "id" | "createdAt">) {
    const result = await this.db.execute(sql`insert into wallet_subjects (case_id, investigation_id, chain, wallet_address, label) values (${input.caseId}::uuid, ${input.investigationId}::uuid, ${input.chain}, ${input.walletAddress}, ${input.label}) returning *`);
    const row = result.rows[0] as Record<string, unknown>;
    return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), walletAddress: text(row.wallet_address), label: row.label as WalletSubjectRecord["label"], createdAt: iso(row.created_at)! };
  }
}

class PostgresEvidenceRepository implements EvidenceRepository {
  constructor(private readonly db: Executor) {}
  async findAccessibleById(actor: Actor, evidenceId: string) {
    const result = await this.db.execute(sql`select e.* from evidence e join cases c on c.id = e.case_id where e.id = ${evidenceId} and (${hasAdminRole(actor)} or exists (select 1 from case_memberships cm where cm.case_id = c.id and cm.user_id = ${actor.id}))`);
    return result.rows[0] ? evidenceRecord(result.rows[0] as Record<string, unknown>) : null;
  }
  async create(input: Omit<EvidenceRecord, "id" | "createdAt">) {
    const result = await this.db.execute(sql`insert into evidence (case_id, investigation_id, subject_type, subject_id, evidence_type, source_type, provider, source_reference, source_url, observed_at, collected_at, method, confidence, raw_reference, content_hash, description, created_by) values (${input.caseId}::uuid, ${input.investigationId}::uuid, ${input.subjectType}, ${input.subjectId}, ${input.evidenceType}, ${input.sourceType}, ${input.provider}, ${input.sourceReference}, ${input.sourceUrl}, ${input.observedAt}::timestamptz, ${input.collectedAt}::timestamptz, ${input.method}, ${input.confidence}, ${input.rawReference}, ${input.contentHash}, ${input.description}, ${input.createdBy}::uuid) returning *`);
    return evidenceRecord(result.rows[0] as Record<string, unknown>);
  }
}

class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly db: Executor) {}
  async append(input: Omit<AuditEventRecord, "id" | "createdAt">) {
    const result = await this.db.execute(sql`insert into audit_events (case_id, actor_id, action, resource_type, resource_id, request_id, result, metadata) values (${input.caseId}::uuid, ${input.actorId}::uuid, ${input.action}, ${input.resourceType}, ${input.resourceId}, ${input.requestId}, ${input.result}, ${JSON.stringify(input.metadata)}::jsonb) returning *`);
    return auditRecord(result.rows[0] as Record<string, unknown>);
  }
  async listByCase(caseId: string) { const result = await this.db.execute(sql`select * from audit_events where case_id = ${caseId}::uuid order by created_at desc`); return result.rows.map((row) => auditRecord(row as Record<string, unknown>)); }
}

class PostgresBlockchainRepository implements BlockchainRepository {
  constructor(private readonly db: Executor) {}
  async upsertWallet(caseId: string, wallet: PersistedBlockchainBundle["wallet"]): Promise<{ id: string }> {
    const provenance = wallet.provenance;
    const result = await this.db.execute(sql`insert into wallets (case_id, chain, address, source_type, provider, source_reference, raw_reference, raw_data, retrieved_at)
      values (${caseId}::uuid, ${wallet.chain}, ${wallet.address}, ${provenance.sourceType}, ${provenance.provider}, ${provenance.sourceReference ?? null}, ${provenance.rawReference ?? null}, ${JSON.stringify(provenance.rawData ?? {})}::jsonb, ${provenance.retrievedAt}::timestamptz)
      on conflict (case_id, chain, lower(address)) where case_id is not null do update set retrieved_at = excluded.retrieved_at, raw_data = coalesce(wallets.raw_data, excluded.raw_data)
      returning id`);
    return { id: text((result.rows[0] as Record<string, unknown>).id) };
  }
  async upsertBundle(input: PersistedBlockchainBundle): Promise<{ transactionId: string }> {
    const wallet = await this.upsertWallet(input.caseId, input.wallet);
    const { transaction, tokenTransfers, contractInteractions } = input.bundle;
    const provenance = transaction.provenance;
    const result = await this.db.execute(sql`insert into blockchain_transactions (case_id, wallet_id, chain, transaction_hash, block_number, block_hash, block_timestamp, confirmations, from_address, to_address, value_numeric, execution_status, source_type, provider, source_reference, raw_reference, raw_data, retrieved_at)
      values (${input.caseId}::uuid, ${wallet.id}::uuid, ${transaction.chain}, ${transaction.transactionHash}, ${transaction.blockNumber ?? null}::bigint, ${transaction.blockHash ?? null}, ${transaction.timestamp ?? null}::timestamptz, ${transaction.confirmations ?? null}, ${transaction.from ?? null}, ${transaction.to ?? null}, ${transaction.value ?? null}::numeric, ${transaction.executionStatus ?? null}, ${provenance.sourceType}, ${provenance.provider}, ${provenance.sourceReference ?? null}, ${provenance.rawReference ?? null}, ${JSON.stringify(provenance.rawData ?? {})}::jsonb, ${provenance.retrievedAt}::timestamptz)
      on conflict (chain, transaction_hash) do update set confirmations = greatest(coalesce(blockchain_transactions.confirmations, 0), coalesce(excluded.confirmations, 0)), from_address = coalesce(blockchain_transactions.from_address, excluded.from_address), to_address = coalesce(blockchain_transactions.to_address, excluded.to_address), value_numeric = coalesce(blockchain_transactions.value_numeric, excluded.value_numeric), execution_status = coalesce(excluded.execution_status, blockchain_transactions.execution_status), retrieved_at = excluded.retrieved_at, raw_data = coalesce(blockchain_transactions.raw_data, excluded.raw_data)
      returning id`);
    const transactionId = text((result.rows[0] as Record<string, unknown>).id);
    for (const value of transaction.inputs) await this.db.execute(sql`insert into transaction_inputs (transaction_id, input_index, address, value_numeric, previous_transaction_hash, previous_output_index, script) values (${transactionId}::uuid, ${value.index}, ${value.address ?? null}, ${value.value ?? null}::numeric, ${value.previousTransactionHash ?? null}, ${value.previousOutputIndex ?? null}, ${value.script ?? null}) on conflict (transaction_id, input_index) do nothing`);
    for (const value of transaction.outputs) await this.db.execute(sql`insert into transaction_outputs (transaction_id, output_index, address, value_numeric, script, spending_transaction_hash) values (${transactionId}::uuid, ${value.index}, ${value.address ?? null}, ${value.value}::numeric, ${value.script ?? null}, ${value.spentByTransactionHash ?? null}) on conflict (transaction_id, output_index) do nothing`);
    for (const transfer of tokenTransfers) { const source = transfer.provenance; await this.db.execute(sql`insert into token_transfers (transaction_id, chain, from_address, to_address, asset, amount_numeric, contract_address, source_type, provider, source_reference, raw_reference, raw_data, retrieved_at) values (${transactionId}::uuid, ${transfer.chain}, ${transfer.from}, ${transfer.to}, ${transfer.asset}, ${transfer.amount}::numeric, ${transfer.contractAddress ?? null}, ${source.sourceType}, ${source.provider}, ${source.sourceReference ?? null}, ${source.rawReference ?? null}, ${JSON.stringify(source.rawData ?? {})}::jsonb, ${source.retrievedAt}::timestamptz) on conflict (transaction_id, chain, from_address, to_address, asset, amount_numeric, coalesce(contract_address, '')) do nothing`); }
    for (const interaction of contractInteractions) { const source = interaction.provenance; const truncatedInput = interaction.input ? interaction.input.substring(0, 512) : null; await this.db.execute(sql`insert into contract_interactions (transaction_id, chain, contract_address, method_selector, input_data, source_type, provider, source_reference, raw_reference, raw_data, retrieved_at) values (${transactionId}::uuid, ${interaction.chain}, ${interaction.contractAddress}, ${interaction.methodSelector ?? null}, ${truncatedInput}, ${source.sourceType}, ${source.provider}, ${source.sourceReference ?? null}, ${source.rawReference ?? null}, ${JSON.stringify(source.rawData ?? {})}::jsonb, ${source.retrievedAt}::timestamptz) on conflict (transaction_id, chain, contract_address, coalesce(method_selector, ''), coalesce(input_data, '')) do nothing`); }
    await new PostgresGraphRepository(this.db).upsertDerivedRelationships(input.caseId, extractRelationships(input.bundle));
    return { transactionId };
  }
  async findTransaction(chain: string, transactionHash: string): Promise<Record<string, unknown> | null> { const result = await this.db.execute(sql`select * from blockchain_transactions where chain = ${chain} and transaction_hash = ${transactionHash}`); return result.rows[0] as Record<string, unknown> ?? null; }
  async listBitcoinTransactions(caseId: string, limit: number): Promise<BitcoinTransactionRecord[]> {
    const result = await this.db.execute(sql`select t.transaction_hash, coalesce(jsonb_agg(distinct jsonb_build_object('address', i.address, 'value', i.value_numeric::text)) filter (where i.id is not null), '[]'::jsonb) as inputs, coalesce(jsonb_agg(distinct jsonb_build_object('address', o.address, 'value', o.value_numeric::text)) filter (where o.id is not null), '[]'::jsonb) as outputs from blockchain_transactions t left join transaction_inputs i on i.transaction_id = t.id left join transaction_outputs o on o.transaction_id = t.id where t.case_id = ${caseId}::uuid and t.chain = 'BITCOIN' group by t.id, t.transaction_hash order by t.transaction_hash limit ${limit}`);
    return result.rows.map((row) => { const value = row as Record<string, unknown>; return { transactionHash: text(value.transaction_hash), inputs: (value.inputs as BitcoinTransactionRecord["inputs"]) ?? [], outputs: (value.outputs as BitcoinTransactionRecord["outputs"]) ?? [] }; });
  }
}

class PostgresGraphRepository implements GraphRepository {
  constructor(private readonly db: Executor) {}
  async upsertDerivedRelationships(caseId: string, relationships: GraphRelationshipInput[]) {
    for (const relationship of relationships) await this.db.execute(sql`insert into investigation_graph_relationships (case_id, chain, transaction_hash, from_address, to_address, relationship_type, asset, amount_numeric, token_contract, block_number, block_timestamp, execution_status, derivation_source_type, provider, source_reference, raw_reference, retrieved_at, method) values (${caseId}::uuid, ${relationship.chain}, ${relationship.transactionHash}, ${relationship.fromAddress}, ${relationship.toAddress}, ${relationship.relationshipType}, ${relationship.asset}, ${relationship.amount}::numeric, ${relationship.tokenContract}, ${relationship.blockNumber}::bigint, ${relationship.timestamp}::timestamptz, ${relationship.executionStatus}, ${relationship.derivationSourceType}, ${relationship.provider}, ${relationship.sourceReference}, ${relationship.rawReference}, ${relationship.retrievedAt}::timestamptz, ${relationship.method}) on conflict (case_id, chain, transaction_hash, lower(from_address), lower(to_address), relationship_type, asset, amount_numeric, coalesce(token_contract, '')) do update set retrieved_at = excluded.retrieved_at, execution_status = coalesce(excluded.execution_status, investigation_graph_relationships.execution_status)`);
  }
  async listByCaseAndChain(caseId: string, chain: string, limit = 10_000) {
    const boundedLimit = Math.min(Math.max(limit, 1), 50_000);
    const result = await this.db.execute(sql`select * from investigation_graph_relationships where case_id = ${caseId}::uuid and chain = ${chain} order by block_timestamp desc nulls last, transaction_hash, id limit ${boundedLimit}`);
    return result.rows.map((row) => graphRelationshipRecord(row as Record<string, unknown>));
  }
}

class PostgresIntelligenceRepository implements IntelligenceRepository {
  constructor(private readonly db: Executor) {}
  async listAddressObservations(caseId: string, investigationId: string, chain: string, address: string) {
    const result = await this.db.execute(sql`select * from address_intelligence_observations where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid and chain = ${chain} and lower(address) = lower(${address}) order by retrieved_at desc, id`);
    return result.rows.map((row) => addressObservationRecord(row as Record<string, unknown>));
  }
  async listObservationsForInvestigation(caseId: string, investigationId: string, chain: string, limit: number) {
    const result = await this.db.execute(sql`select * from address_intelligence_observations where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid and chain = ${chain} order by retrieved_at desc, id limit ${limit}`);
    return result.rows.map((row) => addressObservationRecord(row as Record<string, unknown>));
  }
  async upsertAddressObservations(caseId: string, investigationId: string, values: AddressIntelligenceObservationInput[]) {
    const output: AddressIntelligenceObservationRecord[] = [];
    for (const value of values) {
      const result = await this.db.execute(sql`insert into address_intelligence_observations (case_id, investigation_id, chain, address, label, entity_name, entity_type, source, source_reference, source_url, dataset_name, dataset_version, license, retrieved_at, last_verified, freshness_status, confidence, status, raw_reference, raw_data) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.address}, ${value.label}, ${value.entityName}, ${value.entityType}, ${value.source}, ${value.sourceReference}, ${value.sourceUrl}, ${value.datasetName}, ${value.datasetVersion}, ${value.license}, ${value.retrievedAt}::timestamptz, ${value.lastVerified}::timestamptz, ${value.freshnessStatus}, ${value.confidence}, ${value.status}, ${value.rawReference}, ${JSON.stringify(value.rawData ?? {})}::jsonb) on conflict (case_id, investigation_id, chain, lower(address), source, coalesce(source_reference, ''), coalesce(dataset_version, ''), coalesce(label, ''), coalesce(entity_name, '')) do update set retrieved_at = excluded.retrieved_at, last_verified = excluded.last_verified, freshness_status = excluded.freshness_status, confidence = excluded.confidence, status = excluded.status, raw_data = excluded.raw_data, updated_at = now() returning *`);
      output.push(addressObservationRecord(result.rows[0] as Record<string, unknown>));
    }
    return output;
  }
  async upsertCluster(caseId: string, investigationId: string, value: ClusterInferenceInput) {
    const result = await this.db.execute(sql`insert into cluster_inferences (case_id, investigation_id, cluster_key, chain, method, method_version, confidence_level, numeric_score, review_status, ambiguity_reason, evidence) values (${caseId}::uuid, ${investigationId}::uuid, ${value.clusterKey}, 'BITCOIN', ${value.method}, ${value.methodVersion}, ${value.confidenceLevel}, ${value.numericScore}, ${value.reviewStatus}, ${value.ambiguityReason}, ${JSON.stringify(value.evidence)}::jsonb) on conflict (case_id, investigation_id, cluster_key, method, method_version) do update set confidence_level = excluded.confidence_level, numeric_score = excluded.numeric_score, review_status = excluded.review_status, ambiguity_reason = excluded.ambiguity_reason, evidence = excluded.evidence, updated_at = now() returning *`);
    const row = result.rows[0] as Record<string, unknown>; const id = text(row.id);
    await this.db.execute(sql`delete from cluster_members where cluster_id = ${id}::uuid`);
    for (const member of value.members) await this.db.execute(sql`insert into cluster_members (cluster_id, chain, address, membership_type, evidence) values (${id}::uuid, 'BITCOIN', ${member.address}, ${member.membershipType}, ${JSON.stringify(member.evidence)}::jsonb) on conflict do nothing`);
    return clusterRecord(row, value.members);
  }
  async listClusters(caseId: string, investigationId: string, limit: number) {
    const result = await this.db.execute(sql`select * from cluster_inferences where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid order by created_at desc, id limit ${limit}`);
    const output: ClusterInferenceRecord[] = [];
    for (const row of result.rows) { const value = row as Record<string, unknown>; const members = await this.db.execute(sql`select address, membership_type, evidence from cluster_members where cluster_id = ${text(value.id)}::uuid order by address, membership_type`); output.push(clusterRecord(value, members.rows.map((member) => { const v = member as Record<string, unknown>; return { address: text(v.address), membershipType: v.membership_type as ClusterMember["membershipType"], evidence: (v.evidence as Record<string, unknown>[]) ?? [] }; }))); }
    return output;
  }
  async upsertServiceAssessment(caseId: string, investigationId: string, value: ServiceAddressAssessmentInput) {
    const result = await this.db.execute(sql`insert into service_address_assessments (case_id, investigation_id, chain, address, classification, confidence_level, numeric_score, status, signals) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.address}, ${value.classification}, ${value.confidenceLevel}, ${value.numericScore}, ${value.status}, ${JSON.stringify(value.signals)}::jsonb) on conflict (case_id, investigation_id, chain, lower(address)) do update set classification = excluded.classification, confidence_level = excluded.confidence_level, numeric_score = excluded.numeric_score, status = excluded.status, signals = excluded.signals, updated_at = now() returning *`);
    return serviceAssessmentRecord(result.rows[0] as Record<string, unknown>);
  }
  async upsertVaspCandidate(caseId: string, investigationId: string, value: VaspCandidateInput) {
    const result = await this.db.execute(sql`insert into vasp_candidates (case_id, investigation_id, chain, address, entity_name, entity_type, confidence_level, numeric_score, status, reason, contradictions, method, method_version) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.address}, ${value.entityName}, ${value.entityType}, ${value.confidenceLevel}, ${value.numericScore}, ${value.status}, ${value.reason}, ${JSON.stringify(value.contradictions)}::jsonb, ${value.method}, ${value.methodVersion}) on conflict (case_id, investigation_id, chain, lower(address), coalesce(entity_name, ''), method, method_version) where investigation_id is not null and address is not null do update set confidence_level = excluded.confidence_level, numeric_score = excluded.numeric_score, status = excluded.status, reason = excluded.reason, contradictions = excluded.contradictions, updated_at = now() returning *`);
    const row = result.rows[0] as Record<string, unknown>; const id = text(row.id);
    await this.db.execute(sql`delete from attribution_evidence where candidate_id = ${id}::uuid`);
    for (const item of value.evidence) await this.db.execute(sql`insert into attribution_evidence (case_id, investigation_id, candidate_id, category, evidence_type, subject_type, subject_id, polarity, contribution, source, source_reference, source_url, retrieved_at, method, method_version, raw_reference, details) values (${caseId}::uuid, ${investigationId}::uuid, ${id}::uuid, ${item.category}, ${item.evidenceType}, ${item.subjectType}, ${item.subjectId}, ${item.polarity}, ${item.contribution}, ${item.source}, ${item.sourceReference}, ${item.sourceUrl}, ${item.retrievedAt}::timestamptz, ${item.method}, ${item.methodVersion}, ${item.rawReference}, ${JSON.stringify(item.details)}::jsonb)`);
    return candidateRecord(row, value.evidence);
  }
  async listVaspCandidates(caseId: string, investigationId: string, limit: number) {
    const result = await this.db.execute(sql`select * from vasp_candidates where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid order by numeric_score desc, created_at, id limit ${limit}`);
    const output: VaspCandidateRecord[] = [];
    for (const row of result.rows) { const value = row as Record<string, unknown>; const evidence = await this.db.execute(sql`select * from attribution_evidence where candidate_id = ${text(value.id)}::uuid order by created_at, id`); output.push(candidateRecord(value, evidence.rows.map((item) => { const v = item as Record<string, unknown>; return { category: v.category as VaspCandidateRecord["evidence"][number]["category"], evidenceType: text(v.evidence_type), subjectType: text(v.subject_type), subjectId: text(v.subject_id), polarity: v.polarity as VaspCandidateRecord["evidence"][number]["polarity"], contribution: Number(v.contribution), source: v.source == null ? null : text(v.source), sourceReference: v.source_reference == null ? null : text(v.source_reference), sourceUrl: v.source_url == null ? null : text(v.source_url), retrievedAt: iso(v.retrieved_at), method: text(v.method), methodVersion: text(v.method_version), rawReference: v.raw_reference == null ? null : text(v.raw_reference), details: (v.details as Record<string, unknown>) ?? {} }; }))); }
    return output;
  }
  async findVaspCandidate(caseId: string, investigationId: string, candidateId: string) {
    const result = await this.db.execute(sql`select * from vasp_candidates where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid and id = ${candidateId}::uuid`); const row = result.rows[0] as Record<string, unknown> | undefined; if (!row) return null;
    const evidence = await this.db.execute(sql`select * from attribution_evidence where candidate_id = ${candidateId}::uuid order by created_at, id`);
    return candidateRecord(row, evidence.rows.map((item) => { const v = item as Record<string, unknown>; return { category: v.category as VaspCandidateRecord["evidence"][number]["category"], evidenceType: text(v.evidence_type), subjectType: text(v.subject_type), subjectId: text(v.subject_id), polarity: v.polarity as VaspCandidateRecord["evidence"][number]["polarity"], contribution: Number(v.contribution), source: v.source == null ? null : text(v.source), sourceReference: v.source_reference == null ? null : text(v.source_reference), sourceUrl: v.source_url == null ? null : text(v.source_url), retrievedAt: iso(v.retrieved_at), method: text(v.method), methodVersion: text(v.method_version), rawReference: v.raw_reference == null ? null : text(v.raw_reference), details: (v.details as Record<string, unknown>) ?? {} }; }));
  }
  async appendReview(caseId: string, investigationId: string, candidateId: string, reviewerId: string, input: AttributionReviewInput) {
    const result = await this.db.execute(sql`insert into attribution_reviews (case_id, investigation_id, candidate_id, reviewer_id, decision, rationale) values (${caseId}::uuid, ${investigationId}::uuid, ${candidateId}::uuid, ${reviewerId}::uuid, ${input.decision}, ${input.rationale}) returning *`);
    if (input.decision === "CONFIRMED") await this.db.execute(sql`update vasp_candidates set confidence_level = 'CONFIRMED', status = 'CONFIRMED_BY_REVIEW', updated_at = now() where id = ${candidateId}::uuid`);
    return reviewRecord(result.rows[0] as Record<string, unknown>);
  }
}

function riskRunRecord(row: Record<string, unknown>): RiskAnalysisRunRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: text(row.address), method: text(row.method), methodVersion: text(row.method_version), status: row.status as RiskAnalysisRunRecord["status"], indicatorCount: Number(row.indicator_count), totalRiskScore: row.total_risk_score == null ? null : Number(row.total_risk_score), createdAt: iso(row.created_at)! };
}
function persistedRiskIndicator(row: Record<string, unknown>): PersistedRiskIndicator {
  return { id: text(row.id), runId: text(row.run_id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: row.address == null ? null : text(row.address), indicatorType: text(row.indicator_type), severity: text(row.severity), scoreContribution: Number(row.score_contribution), confidence: text(row.confidence_level), description: text(row.description), explanation: text(row.explanation), method: text(row.method), methodVersion: text(row.method_version), observedAt: iso(row.observed_at), createdAt: iso(row.created_at)! };
}
function persistedGraphFeature(row: Record<string, unknown>): PersistedGraphFeature {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: text(row.investigation_id), chain: text(row.chain), address: text(row.address), featureType: text(row.feature_type), value: Number(row.value), method: text(row.method), methodVersion: text(row.method_version), scopeDescription: row.scope_description == null ? "" : text(row.scope_description), computedAt: iso(row.computed_at)! };
}
function forensicReportRecord(row: Record<string, unknown>): ForensicReportRecord {
  return { id: text(row.id), caseId: text(row.case_id), investigationId: row.investigation_id == null ? null : text(row.investigation_id), generatedBy: row.generated_by == null ? null : text(row.generated_by), title: text(row.title), reportType: row.report_type as ForensicReportRecord["reportType"], content: (row.content as Record<string, unknown>) ?? {}, methodVersions: (row.method_versions as Record<string, string>) ?? {}, createdAt: iso(row.created_at)! };
}

class PostgresAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Executor) {}

  async persistRiskAnalysis(input: { caseId: string; investigationId: string; actorId: string; chain: string; address: string; method: string; methodVersion: string; status: "COMPLETED" | "FAILED" | "PARTIAL"; totalRiskScore: number; indicators: RiskIndicatorPersistenceInput[] }) {
    const runResult = await this.db.execute(sql`insert into risk_analysis_runs (case_id, investigation_id, chain, address, method, method_version, status, indicator_count, total_risk_score, created_by, completed_at) values (${input.caseId}::uuid, ${input.investigationId}::uuid, ${input.chain}, ${input.address}, ${input.method}, ${input.methodVersion}, ${input.status}, ${input.indicators.length}, ${input.totalRiskScore}, ${input.actorId}::uuid, now()) returning *`);
    const run = riskRunRecord(runResult.rows[0] as Record<string, unknown>);
    const indicators: PersistedRiskIndicator[] = [];
    for (const item of input.indicators) {
      const confidence = item.confidence === "HIGH" ? 0.9 : item.confidence === "MEDIUM" ? 0.6 : 0.3;
      const result = await this.db.execute(sql`insert into risk_indicators (run_id, case_id, investigation_id, chain, address, indicator_type, category, rule_version, severity, score_contribution, score_semantics, confidence_level, explanation, observed_at, method, method_version, provenance, name, confidence, source_type) values (${run.id}::uuid, ${input.caseId}::uuid, ${input.investigationId}::uuid, ${input.chain}, ${input.address}, ${item.indicatorType}, 'HEURISTIC_INDICATOR', ${item.ruleVersion}, ${item.severity}, ${item.scoreContribution}, 'HEURISTIC_SCORE_NOT_PROBABILITY', ${item.confidence}, ${item.explanation}, ${item.observedAt ?? null}::timestamptz, ${input.method}, ${input.methodVersion}, ${JSON.stringify({ evidenceCount: item.evidence.length, source: "stored_graph_relationships" })}::jsonb, ${item.indicatorType}, ${confidence}, 'DERIVED') returning *`);
      const row = result.rows[0] as Record<string, unknown>;
      const indicatorId = text(row.id);
      for (const evidence of item.evidence) await this.db.execute(sql`insert into risk_indicator_evidence (indicator_id, evidence_type, subject_type, subject_id, value, source, source_reference, method, method_version) values (${indicatorId}::uuid, ${evidence.evidenceType}, ${evidence.subjectType}, ${evidence.subjectId}, ${evidence.value ?? null}, ${evidence.source ?? null}, ${evidence.sourceReference ?? null}, ${evidence.method}, ${evidence.methodVersion})`);
      indicators.push(persistedRiskIndicator(row));
    }
    return { run, indicators };
  }

  async listRiskIndicators(caseId: string, investigationId: string, limit: number) {
    const result = await this.db.execute(sql`select * from risk_indicators where case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid and run_id is not null order by created_at desc, id limit ${limit}`);
    return result.rows.map((row) => persistedRiskIndicator(row as Record<string, unknown>));
  }
  async findRiskIndicator(caseId: string, investigationId: string, indicatorId: string) {
    const result = await this.db.execute(sql`select * from risk_indicators where id = ${indicatorId}::uuid and case_id = ${caseId}::uuid and investigation_id = ${investigationId}::uuid and run_id is not null`);
    return result.rows[0] ? persistedRiskIndicator(result.rows[0] as Record<string, unknown>) : null;
  }
  async upsertGraphFeatures(caseId: string, investigationId: string, values: GraphFeaturePersistenceInput[]) {
    const output: PersistedGraphFeature[] = [];
    for (const value of values) {
      const result = await this.db.execute(sql`insert into graph_features (case_id, investigation_id, chain, address, feature_type, value, method, method_version, scope_description, computed_at) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.address}, ${value.featureType}, ${value.value}, ${value.method}, ${value.methodVersion}, ${value.scopeDescription}, ${value.computedAt}::timestamptz) on conflict (case_id, investigation_id, chain, lower(address), feature_type, method, method_version) do update set value = excluded.value, scope_description = excluded.scope_description, computed_at = excluded.computed_at returning *`);
      output.push(persistedGraphFeature(result.rows[0] as Record<string, unknown>));
    }
    return output;
  }
  async persistCommunities(input: { caseId: string; investigationId: string; actorId: string; chain: string; maxNodes: number; maxEdges: number; maxRuntimeMs: number; totalNodes: number; totalEdges: number; communities: CommunityPersistenceInput[] }) {
    const result = await this.db.execute(sql`insert into community_analysis_runs (case_id, investigation_id, chain, method, method_version, max_nodes, max_edges, max_runtime_ms, total_nodes, total_edges, community_count, created_by) values (${input.caseId}::uuid, ${input.investigationId}::uuid, ${input.chain}, 'cashnet-community-detection', '1.0.0', ${input.maxNodes}, ${input.maxEdges}, ${input.maxRuntimeMs}, ${input.totalNodes}, ${input.totalEdges}, ${input.communities.length}, ${input.actorId}::uuid) returning *`);
    const run = result.rows[0] as Record<string, unknown>; const runId = text(run.id);
    for (const item of input.communities) await this.db.execute(sql`insert into graph_communities (run_id, community_key, members, member_count, edge_count, chains, confidence, explanation, method, method_version) values (${runId}::uuid, ${item.communityKey}, ${JSON.stringify(item.members)}::jsonb, ${item.memberCount}, ${item.edgeCount}, ${'{' + item.chains.join(',') + '}'}::text[], ${item.confidence}, ${item.explanation}, ${item.method}, ${item.methodVersion})`);
    return { id: runId, caseId: text(run.case_id), investigationId: text(run.investigation_id), chain: text(run.chain), totalNodes: Number(run.total_nodes), totalEdges: Number(run.total_edges), communityCount: Number(run.community_count), createdAt: iso(run.created_at)! } as CommunityRunRecord;
  }
  async persistDeFiInteractions(caseId: string, investigationId: string, values: DeFiInteractionPersistenceInput[]) {
    for (const value of values) await this.db.execute(sql`insert into defi_protocol_interactions (case_id, investigation_id, chain, transaction_hash, protocol_name, protocol_address, interaction_type, token_in, amount_in, token_out, amount_out, router_address, method, method_version) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.transactionHash}, ${value.protocolName ?? null}, ${value.protocolAddress}, ${value.interactionType}, ${value.tokenIn ?? null}, ${value.amountIn ?? null}, ${value.tokenOut ?? null}, ${value.amountOut ?? null}, ${value.routerAddress ?? null}, ${value.method}, ${value.methodVersion})`);
    return values.length;
  }
  async persistMevCandidates(caseId: string, investigationId: string, values: MevCandidatePersistenceInput[]) {
    for (const value of values) await this.db.execute(sql`insert into mev_candidates (case_id, investigation_id, chain, mev_type, confidence_level, front_run_hash, victim_hash, back_run_hash, pool_address, profit_estimate, evidence, method, method_version) values (${caseId}::uuid, ${investigationId}::uuid, ${value.chain}, ${value.mevType}, ${value.confidenceLevel}, ${value.frontRunHash ?? null}, ${value.victimHash ?? null}, ${value.backRunHash ?? null}, ${value.poolAddress ?? null}, ${value.profitEstimate ?? null}, ${JSON.stringify(value.evidence)}::jsonb, ${value.method}, ${value.methodVersion})`);
    return values.length;
  }
  async createReport(caseId: string, investigationId: string | null, actorId: string, value: ForensicReportPersistenceInput) {
    const result = await this.db.execute(sql`insert into forensic_reports (case_id, investigation_id, title, generated_by, report_type, content, method_versions) values (${caseId}::uuid, ${investigationId}::uuid, ${value.title}, ${actorId}::uuid, ${value.reportType}, ${JSON.stringify(value.content)}::jsonb, ${JSON.stringify(value.methodVersions)}::jsonb) returning *`);
    return forensicReportRecord(result.rows[0] as Record<string, unknown>);
  }
  async findReport(caseId: string, reportId: string) {
    const result = await this.db.execute(sql`select * from forensic_reports where id = ${reportId}::uuid and case_id = ${caseId}::uuid`);
    return result.rows[0] ? forensicReportRecord(result.rows[0] as Record<string, unknown>) : null;
  }
}

class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Executor) {}
  async findActorByUsername(username: string): Promise<Actor | null> {
    const result = await this.db.execute(sql`select u.id, u.username, u.status, coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles, coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}') as permissions from users u left join user_roles ur on ur.user_id = u.id left join roles r on r.id = ur.role_id left join role_permissions rp on rp.role_id = r.id left join permissions p on p.id = rp.permission_id where u.username = ${username} group by u.id`);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row || row.status !== "ACTIVE") return null;
    return { id: text(row.id), username: text(row.username), roles: (row.roles as string[]) ?? [], permissions: ((row.permissions as string[]) ?? []) as Actor["permissions"] };
  }
}

export class PostgresRepositories implements TransactionCoordinator {
  constructor(private readonly db: CashnetDatabase) {}
  context(): RepositoryContext {
    const executor = this.db as Executor;
    return { cases: new PostgresCaseRepository(executor), investigations: new PostgresInvestigationRepository(executor), walletSubjects: new PostgresWalletSubjectRepository(executor), evidence: new PostgresEvidenceRepository(executor), audit: new PostgresAuditRepository(executor), users: new PostgresUserRepository(executor), blockchain: new PostgresBlockchainRepository(executor), graph: new PostgresGraphRepository(executor), intelligence: new PostgresIntelligenceRepository(executor), analytics: new PostgresAnalyticsRepository(executor) };
  }
  async transaction<T>(work: (repositories: RepositoryContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (transaction) => {
      const executor = transaction as unknown as Executor;
      return work({ cases: new PostgresCaseRepository(executor), investigations: new PostgresInvestigationRepository(executor), walletSubjects: new PostgresWalletSubjectRepository(executor), evidence: new PostgresEvidenceRepository(executor), audit: new PostgresAuditRepository(executor), users: new PostgresUserRepository(executor), blockchain: new PostgresBlockchainRepository(executor), graph: new PostgresGraphRepository(executor), intelligence: new PostgresIntelligenceRepository(executor), analytics: new PostgresAnalyticsRepository(executor) });
    });
  }
}
