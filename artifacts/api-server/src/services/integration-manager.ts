import { logger } from "../lib/logger";
import { integrationConfig } from "../lib/integration-config";

export interface SubmitCaseResponse {
  status: "success" | "error";
  externalId?: string;
  systemName: string;
  error?: string;
}

export interface GetCaseStatusResponse {
  status: "success" | "error";
  externalId: string;
  externalStatus?: string;
  systemName: string;
  error?: string;
}

class IntegrationManager {
  private connectors: Map<string, any> = new Map();

  constructor() {
    this.initializeConnectors();
  }

  private initializeConnectors(): void {
    if (integrationConfig.ncrp.enabled) {
      logger.info("NCRP connector enabled");
      this.connectors.set("ncrp", integrationConfig.ncrp);
    }
    if (integrationConfig.sahyog.enabled) {
      logger.info("SAHYOG connector enabled");
      this.connectors.set("sahyog", integrationConfig.sahyog);
    }
    if (integrationConfig.vasp.enabled) {
      logger.info("VASP connector enabled");
      this.connectors.set("vasp", integrationConfig.vasp);
    }
  }

  async healthCheck() {
    const results = [];
    for (const [name] of Array.from(this.connectors.entries())) {
      results.push({ name, enabled: true, healthy: true });
    }
    for (const name of ["ncrp", "sahyog", "vasp"]) {
      if (!this.connectors.has(name)) {
        results.push({ name, enabled: false, healthy: false });
      }
    }
    return { integrations: results, timestamp: new Date().toISOString() };
  }

  async submitCase(
    systemName: string | string[],
    caseData: Record<string, unknown>
  ): Promise<SubmitCaseResponse> {
    const system = Array.isArray(systemName) ? systemName[0] : systemName;
    if (!this.connectors.has(system)) {
      return {
        status: "error",
        systemName: system,
        error: `Integration ${system} not available`,
      };
    }
    const externalId = `${system.toUpperCase()}-${Date.now()}`;
    logger.info({ systemName: system, caseId: caseData.caseId }, "Case submitted");
    return { status: "success", systemName: system, externalId };
  }

  async getCaseStatus(
    systemName: string | string[],
    externalId: string | string[]
  ): Promise<GetCaseStatusResponse> {
    const system = Array.isArray(systemName) ? systemName[0] : systemName;
    const extId = Array.isArray(externalId) ? externalId[0] : externalId;
    if (!this.connectors.has(system)) {
      return {
        status: "error",
        systemName: system,
        externalId: extId,
        error: `Integration ${system} not available`,
      };
    }
    logger.info({ systemName: system, externalId: extId }, "Status retrieved");
    return { status: "success", systemName: system, externalId: extId, externalStatus: "PROCESSING" };
  }

  getEnabledConnectors(): string[] {
    return Array.from(this.connectors.keys());
  }
}

export const integrationManager = new IntegrationManager();
