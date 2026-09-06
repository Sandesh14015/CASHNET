import { readFile } from "node:fs/promises";
import type { CashnetConfig } from "../../config";
import type { AddressIntelligenceObservationInput, EntityType } from "../../repositories/types";
import type { AddressIntelligenceProvider, AddressIntelligenceProviderResult } from "./provider-interfaces";

type DatasetRow = { chain: string; address: string; label?: string; entity_name?: string; entity_type?: EntityType; source_reference?: string; source_url?: string; last_verified?: string; confidence?: number; raw_reference?: string; raw_data?: Record<string, unknown> };
const entityTypes = new Set<EntityType>(["EXCHANGE", "VASP", "CUSTODIAL_SERVICE", "DEX", "BRIDGE", "MIXER", "MINING_POOL", "DEFI", "SCAM", "PHISHING", "SANCTIONED_ENTITY", "OTHER", "UNKNOWN"]);

/** A local-only adapter activated only after explicit dataset identity, version, licence and approval configuration. */
export class ApprovedDatasetAddressIntelligenceProvider implements AddressIntelligenceProvider {
  constructor(private readonly config: CashnetConfig) {}
  async lookup(input: { chain: string; address: string }): Promise<AddressIntelligenceProviderResult> {
    const dataset = this.config.intelligence.approvedDataset;
    if (this.config.dataMode !== "authorized" || !dataset) return { status: "NOT_CONFIGURED", observations: [] };
    try {
      const parsed = JSON.parse(await readFile(dataset.path, "utf8")) as unknown;
      if (!Array.isArray(parsed)) return { status: "UNAVAILABLE", observations: [], message: "Approved dataset must be a JSON array." };
      const now = new Date().toISOString();
      const observations = parsed.filter((row): row is DatasetRow => Boolean(row && typeof row === "object" && typeof (row as DatasetRow).chain === "string" && typeof (row as DatasetRow).address === "string"))
        .filter((row) => row.chain.toUpperCase() === input.chain.toUpperCase() && row.address.toLowerCase() === input.address.toLowerCase())
        .map((row): AddressIntelligenceObservationInput => ({ chain: row.chain.toUpperCase(), address: row.address, label: row.label ?? null, entityName: row.entity_name ?? row.label ?? null, entityType: row.entity_type && entityTypes.has(row.entity_type) ? row.entity_type : "UNKNOWN", source: `approved-dataset:${dataset.name}`, sourceReference: row.source_reference ?? null, sourceUrl: row.source_url ?? null, datasetName: dataset.name, datasetVersion: dataset.version, license: dataset.license, retrievedAt: now, lastVerified: row.last_verified ?? null, freshnessStatus: freshness(row.last_verified), confidence: validConfidence(row.confidence), status: "ACTIVE", rawReference: row.raw_reference ?? null, rawData: row.raw_data ?? null }));
      return { status: "SUCCESS", observations };
    } catch { return { status: "UNAVAILABLE", observations: [], message: "Approved dataset could not be read." }; }
  }
}
function freshness(lastVerified?: string): "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN" { if (!lastVerified || Number.isNaN(Date.parse(lastVerified))) return "UNKNOWN"; const age = Date.now() - Date.parse(lastVerified); return age > 365 * 86_400_000 ? "EXPIRED" : age > 180 * 86_400_000 ? "STALE" : "FRESH"; }
function validConfidence(value?: number): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.5; }
