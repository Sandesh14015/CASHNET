import { ProviderFailureError, UnavailableServiceError } from "../../errors/app-error";
import type { Actor } from "../../repositories/types";

/**
 * Generic OIDC/JWT Authentication
 *
 * Provider-neutral: works with any compliant OIDC provider.
 * No Auth0, Keycloak, or other provider is hardcoded.
 *
 * Production requirements:
 * - Issuer verification against configured allowlist
 * - Audience verification against CASHNET_JWT_AUDIENCE
 * - Signature verification via JWKS endpoint (RS256/ES256)
 * - Expiry validation with configurable clock skew
 * - Key rotation via JWKS cache with TTL
 * - Account disablement check
 * - Role mapping from JWT claims to CASHNET roles
 */

export interface JWTConfig {
  issuerAllowlist: string[];
  audience: string;
  jwksUri: string;
  clockSkewSeconds: number;
  jwksCacheTtlMs: number;
  roleClaimPath: string;
}

interface JWTHeader { alg: string; kid?: string; typ?: string }
interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  [key: string]: unknown;
}

interface JWK { kty: string; kid?: string; use?: string; alg?: string; n?: string; e?: string; x?: string; y?: string; crv?: string }
interface JWKSResponse { keys: JWK[] }

export class JWTAuthenticator {
  private jwksCache: { keys: JWK[]; cachedAt: number } | null = null;
  private readonly config: JWTConfig;

  constructor(config: JWTConfig) {
    this.config = config;
  }

  static fromEnv(): JWTAuthenticator | null {
    const issuerAllowlist = process.env.CASHNET_JWT_ISSUERS?.split(",").map((s) => s.trim()).filter(Boolean);
    const audience = process.env.CASHNET_JWT_AUDIENCE;
    const jwksUri = process.env.CASHNET_JWKS_URI;
    if (!issuerAllowlist?.length || !audience || !jwksUri) return null;
    return new JWTAuthenticator({
      issuerAllowlist, audience, jwksUri,
      clockSkewSeconds: Number(process.env.CASHNET_JWT_CLOCK_SKEW ?? "30"),
      jwksCacheTtlMs: Number(process.env.CASHNET_JWKS_CACHE_TTL_MS ?? "3600000"),
      roleClaimPath: process.env.CASHNET_JWT_ROLE_CLAIM ?? "roles",
    });
  }

  async authenticate(token: string): Promise<{ subject: string; roles: string[]; claims: JWTPayload }> {
    // Decode header and payload (not yet verified)
    const parts = token.split(".");
    if (parts.length !== 3) throw new ProviderFailureError("Invalid JWT: expected 3 parts.");
    const header = this.decodeBase64Url<JWTHeader>(parts[0]);
    const payload = this.decodeBase64Url<JWTPayload>(parts[1]);

    // Validate issuer
    if (!payload.iss || !this.config.issuerAllowlist.includes(payload.iss)) {
      throw new ProviderFailureError(`JWT issuer "${payload.iss}" is not in the allowed issuer list.`);
    }

    // Validate audience
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.config.audience)) {
      throw new ProviderFailureError(`JWT audience does not include "${this.config.audience}".`);
    }

    // Validate expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp + this.config.clockSkewSeconds < now) {
      throw new ProviderFailureError("JWT has expired.");
    }
    if (payload.nbf && payload.nbf - this.config.clockSkewSeconds > now) {
      throw new ProviderFailureError("JWT is not yet valid (nbf).");
    }

    // Validate algorithm
    if (!["RS256", "ES256"].includes(header.alg)) {
      throw new ProviderFailureError(`Unsupported JWT algorithm: ${header.alg}. Only RS256 and ES256 are supported.`);
    }

    await this.ensureJWKSCached();
    if (!header.kid) throw new ProviderFailureError("JWT missing kid header.");
    let key: JWK | undefined = this.jwksCache?.keys.find((candidate: JWK) => candidate.kid === header.kid);
    if (!key) {
      this.jwksCache = null;
      await this.ensureJWKSCached();
      const refreshed = this.jwksCache as { keys: JWK[]; cachedAt: number } | null;
      key = refreshed?.keys.find((candidate: JWK) => candidate.kid === header.kid);
    }
    if (!key) throw new ProviderFailureError(`No JWKS key found for kid="${header.kid}" after cache refresh.`);
    if (key.use && key.use !== "sig") throw new ProviderFailureError("JWT JWKS key is not designated for signatures.");
    if (key.alg && key.alg !== header.alg) throw new ProviderFailureError("JWT algorithm does not match JWKS key algorithm.");
    await this.verifySignature(header.alg as "RS256" | "ES256", key, `${parts[0]}.${parts[1]}`, parts[2]);

    // Extract subject
    const subject = payload.sub;
    if (!subject) throw new ProviderFailureError("JWT missing sub claim.");

    // Extract roles from configurable claim path
    const roles = this.extractRoles(payload);

    return { subject, roles, claims: payload };
  }

  private extractRoles(payload: JWTPayload): string[] {
    const path = this.config.roleClaimPath.split(".");
    let current: unknown = payload;
    for (const segment of path) {
      if (current == null || typeof current !== "object") return [];
      current = (current as Record<string, unknown>)[segment];
    }
    if (Array.isArray(current)) return current.filter((r): r is string => typeof r === "string");
    if (typeof current === "string") return [current];
    return [];
  }

  private async ensureJWKSCached(): Promise<void> {
    if (this.jwksCache && Date.now() - this.jwksCache.cachedAt < this.config.jwksCacheTtlMs) return;
    try {
      const response = await fetch(this.config.jwksUri);
      if (!response.ok) throw new UnavailableServiceError(`JWKS endpoint returned ${response.status}.`);
      const data = await response.json() as JWKSResponse;
      if (!data.keys || !Array.isArray(data.keys)) throw new ProviderFailureError("Invalid JWKS response.");
      this.jwksCache = { keys: data.keys, cachedAt: Date.now() };
    } catch (error) {
      if (error instanceof ProviderFailureError || error instanceof UnavailableServiceError) throw error;
      throw new UnavailableServiceError("Failed to fetch JWKS endpoint.");
    }
  }

  private async verifySignature(algorithm: "RS256" | "ES256", jwk: JWK, signingInput: string, encodedSignature: string): Promise<void> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new UnavailableServiceError("Web Crypto is unavailable for JWT signature verification.");
    const importAlgorithm = algorithm === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" };
    let key: CryptoKey;
    try {
      key = await subtle.importKey("jwk", jwk as never, importAlgorithm, false, ["verify"]);
    } catch {
      throw new ProviderFailureError("JWT JWKS key could not be imported for signature verification.");
    }
    let verified = false;
    try {
      const signature = Buffer.from(encodedSignature, "base64url");
      const input = new TextEncoder().encode(signingInput);
      verified = algorithm === "RS256"
        ? await subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, input)
        : await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, input);
    } catch {
      verified = false;
    }
    if (!verified) throw new ProviderFailureError("JWT signature verification failed.");
  }

  private decodeBase64Url<T>(value: string): T {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as T;
  }
}
