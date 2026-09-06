export interface ConnectorConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  timeout: number;
  orgId?: string;
  clientId?: string;
}

export interface IntegrationConfig {
  ncrp: ConnectorConfig;
  sahyog: ConnectorConfig;
  vasp: ConnectorConfig;
}

function loadConnectorConfig(prefix: string): ConnectorConfig {
  const enabled = process.env[`${prefix}_ENABLED`]?.toLowerCase() === "true";
  const apiUrl = process.env[`${prefix}_API_URL`] || "";
  const apiKey = process.env[`${prefix}_API_KEY`] || "";
  const timeout = parseInt(process.env[`${prefix}_TIMEOUT`] || "30", 10);
  return {
    enabled: enabled && !!apiUrl && !!apiKey,
    apiUrl,
    apiKey,
    timeout: Math.max(1, Math.min(300, timeout)),
    orgId: process.env[`${prefix}_ORG_ID`],
    clientId: process.env[`${prefix}_CLIENT_ID`],
  };
}

export const integrationConfig: IntegrationConfig = {
  ncrp: loadConnectorConfig("NCRP"),
  sahyog: loadConnectorConfig("SAHYOG"),
  vasp: loadConnectorConfig("VASP"),
};
