import type { Request } from "express";
import { config } from "../config";
import { AuthenticationRequiredError, UnavailableServiceError } from "../errors/app-error";
import type { UserRepository } from "../repositories/user-repository";
import type { Actor } from "../repositories/types";

const DEV_ACTOR_HEADER = "x-cashnet-dev-actor";

export type DevelopmentAuthenticationRuntime = Pick<typeof config, "environment" | "developmentAuthEnabled">;

export class DevelopmentActorAuthenticator {
  constructor(private readonly users: UserRepository, private readonly runtime: DevelopmentAuthenticationRuntime = config) {}

  async authenticate(request: Request): Promise<Actor> {
    if (this.runtime.environment === "production" || !this.runtime.developmentAuthEnabled) {
      throw new UnavailableServiceError("Development authentication is disabled.");
    }
    const rawActor = request.header(DEV_ACTOR_HEADER)?.trim();
    if (!rawActor) throw new AuthenticationRequiredError("Provide X-Cashnet-Dev-Actor in development.");
    const actor = await this.users.findActorByUsername(rawActor);
    if (!actor) throw new AuthenticationRequiredError("Unknown or disabled development actor.");
    return actor;
  }
}
