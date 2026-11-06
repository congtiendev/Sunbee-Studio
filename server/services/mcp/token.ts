import { randomBytes } from "node:crypto";
import type { User } from "../../../shared/types.js";
import { listAllUsers } from "../db/users-repo.js";
import { getSettings } from "../../settings-store.js";

export function generateMcpToken(): string {
  return randomBytes(32).toString("hex");
}

export function findUserByMcpToken(token: string): User | null {
  for (const user of listAllUsers()) {
    const settings = getSettings(user.id);
    if (settings.mcpEnabled && settings.mcpToken === token) return user;
  }
  return null;
}
