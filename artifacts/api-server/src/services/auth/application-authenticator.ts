import type { Request } from "express";
import { AuthenticationRequiredError, UnavailableServiceError } from "../../errors/app-error";
import type { UserRepository } from "../../repositories/user-repository";
import type { Actor } from "../../repositories/types";
import { config } from "../../config";
import { DevelopmentActorAuthenticator } from "../../auth/actor-context";
import { JWTAuthenticator } from "./jwt-authenticator";

/** All seeded development identities are barred from the production JWT path.
 * Production operators must provision distinct, managed identities instead. */
export function isReservedDevelopmentSubject(subject: string): boolean {
  return subject.toLocaleLowerCase("en-US").startsWith("demo.");
}

/** Selects the only permitted authentication boundary for the environment.
 * JWT claims are never trusted as application roles: roles come from CASHNET's
 * active user/role records after a cryptographically verified subject lookup. */
export class ApplicationAuthenticator {
  private readonly development: DevelopmentActorAuthenticator;
  private readonly jwt: JWTAuthenticator | null;
  constructor(
    private readonly users: UserRepository,
    private readonly runtime: Pick<typeof config, "environment" | "developmentAuthEnabled"> = config,
    jwt: JWTAuthenticator | null | undefined = undefined,
  ) {
    this.development = new DevelopmentActorAuthenticator(users, runtime);
    this.jwt = jwt === undefined ? JWTAuthenticator.fromEnv() : jwt;
  }
  async authenticate(request: Request): Promise<Actor> {
    if (this.runtime.environment !== "production") return this.development.authenticate(request);
    if (!this.jwt) throw new UnavailableServiceError("Production JWT/OIDC authentication is not configured.");
    const header = request.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new AuthenticationRequiredError("Provide a Bearer token.");
    const verified = await this.jwt.authenticate(header.slice("Bearer ".length).trim());
    if (isReservedDevelopmentSubject(verified.subject)) {
      throw new AuthenticationRequiredError("Reserved development identities are not permitted in production.");
    }
    const actor = await this.users.findActorByUsername(verified.subject);
    if (!actor) throw new AuthenticationRequiredError("Unknown or disabled authenticated user.");
    return actor;
  }
}
