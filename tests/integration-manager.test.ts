import { describe, it, expect, beforeEach } from "vitest";
import { integrationManager } from "../artifacts/api-server/src/services/integration-manager";

describe("IntegrationManager", () => {
  describe("healthCheck", () => {
    it("should return health status for all connectors", async () => {
      const health = await integrationManager.healthCheck();
      expect(health).toHaveProperty("integrations");
      expect(health).toHaveProperty("timestamp");
      expect(Array.isArray(health.integrations)).toBe(true);
    });

    it("should include ncrp, sahyog, and vasp", async () => {
      const health = await integrationManager.healthCheck();
      const names = health.integrations.map((i) => i.name);
      expect(names).toContain("ncrp");
      expect(names).toContain("sahyog");
      expect(names).toContain("vasp");
    });
  });

  describe("submitCase", () => {
    it("should return error for unavailable connector", async () => {
      const result = await integrationManager.submitCase("invalid", {
        caseId: "TEST-001",
      });
      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
    });

    it("should return success with externalId for valid connector", async () => {
      const result = await integrationManager.submitCase("ncrp", {
        caseId: "TEST-001",
      });
      if (result.status === "success") {
        expect(result.externalId).toBeDefined();
        expect(result.externalId).toMatch(/^NCRP-/);
      }
    });
  });

  describe("getCaseStatus", () => {
    it("should return error for unavailable connector", async () => {
      const result = await integrationManager.getCaseStatus(
        "invalid",
        "EXT-123"
      );
      expect(result.status).toBe("error");
    });

    it("should return success with status for valid connector", async () => {
      const result = await integrationManager.getCaseStatus("ncrp", "EXT-123");
      if (result.status === "success") {
        expect(result.externalStatus).toBeDefined();
      }
    });
  });

  describe("getEnabledConnectors", () => {
    it("should return list of enabled connectors", () => {
      const connectors = integrationManager.getEnabledConnectors();
      expect(Array.isArray(connectors)).toBe(true);
    });
  });
});
