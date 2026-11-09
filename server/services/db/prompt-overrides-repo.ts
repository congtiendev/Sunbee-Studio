import { randomUUID } from "node:crypto";
import { getDb } from "./client.js";
import type { PromptOverride, PromptScope } from "../../../shared/types.js";

interface PromptOverrideRow {
  id: string;
  scope: PromptScope;
  user_id: string;
  task_key: string;
  slot: string;
  content: string;
  updated_at: string;
}

function rowToOverride(row: PromptOverrideRow): PromptOverride {
  return {
    scope: row.scope,
    taskKey: row.task_key,
    slot: row.slot,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

/** `userId` must be "" for the global scope. */
export function findPromptOverride(
  scope: PromptScope,
  userId: string,
  taskKey: string,
  slot: string,
): PromptOverride | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM prompt_overrides
       WHERE scope = ? AND user_id = ? AND task_key = ? AND slot = ?`,
    )
    .get(scope, userId, taskKey, slot) as PromptOverrideRow | undefined;
  return row ? rowToOverride(row) : null;
}

/** All overrides that apply to a user: their own plus the global ones. */
export function listPromptOverridesFor(userId: string): PromptOverride[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM prompt_overrides
       WHERE (scope = 'user' AND user_id = ?) OR scope = 'global'`,
    )
    .all(userId) as PromptOverrideRow[];
  return rows.map(rowToOverride);
}

export function upsertPromptOverride(
  scope: PromptScope,
  userId: string,
  taskKey: string,
  slot: string,
  content: string,
): PromptOverride {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO prompt_overrides (id, scope, user_id, task_key, slot, content, updated_at)
       VALUES (@id, @scope, @userId, @taskKey, @slot, @content, @now)
       ON CONFLICT (scope, user_id, task_key, slot)
       DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    .run({ id: randomUUID(), scope, userId, taskKey, slot, content, now });
  return { scope, taskKey, slot, content, updatedAt: now };
}

export function deletePromptOverride(
  scope: PromptScope,
  userId: string,
  taskKey: string,
  slot: string,
): void {
  getDb()
    .prepare(
      `DELETE FROM prompt_overrides
       WHERE scope = ? AND user_id = ? AND task_key = ? AND slot = ?`,
    )
    .run(scope, userId, taskKey, slot);
}
