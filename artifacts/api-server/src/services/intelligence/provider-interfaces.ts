import type { AddressIntelligenceObservationInput } from "../../repositories/types";

export type AddressIntelligenceProviderResult = { status: "SUCCESS" | "NOT_CONFIGURED" | "UNAVAILABLE"; observations: AddressIntelligenceObservationInput[]; message?: string };
/** Read-only source port. Providers return observations, never ownership or person identity claims. */
export interface AddressIntelligenceProvider { lookup(input: { chain: string; address: string }): Promise<AddressIntelligenceProviderResult>; }
export type AbuseIntelligenceProviderResult = { status: "NOT_CONFIGURED" | "UNAVAILABLE"; observations: [] };
/** Optional future port. Phase 5 makes no Chainabuse request and fabricates no abuse report. */
export interface AbuseIntelligenceProvider { lookup(input: { chain: string; address: string }): Promise<AbuseIntelligenceProviderResult>; }
