import { randomBytes } from "node:crypto";
import type { User } from "../../../shared/types.js";
import { getDb } from "../db/client.js";
import { getUserById } from "../db/users-repo.js";

export function createSessionToken(userId: string): string {
  const token = randomBytes(32).toString("hex");
  getDb()
    .prepare(
      `INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`,
    )
    .run(token, userId, new Date().toISOString());
  return token;
}

export function resolveSessionToken(token: string): User | null {
  if (!token) return null;
  const row = getDb()
    .prepare(`SELECT user_id FROM sessions WHERE token = ?`)
    .get(token) as { user_id: string } | undefined;
  if (!row) return null;
  return getUserById(row.user_id);
}

export function deleteSessionToken(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}
