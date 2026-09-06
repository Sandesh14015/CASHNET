import type { Actor } from "./types";

export interface UserRepository {
  findActorByUsername(username: string): Promise<Actor | null>;
}
