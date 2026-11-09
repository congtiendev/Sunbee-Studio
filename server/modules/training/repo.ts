import { randomUUID } from "node:crypto";
import type {
  SkillSnapshot,
  SkillVersionKind,
  TrainingSourceRef,
} from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";
import type { SourceDigest } from "./sources/types.js";

/** A source as stored in a version: cumulative, with what that run added marked. */
export interface StoredSource extends TrainingSourceRef {
  added?: boolean;
}

/** A stored version; source labels are resolved by the service. */
export interface SkillVersionRecord {
  id: string;
  skillId: string;
  version: number;
  kind: SkillVersionKind;
  note: string;
  createdAt: string;
  snapshot: SkillSnapshot;
  sources: StoredSource[];
  provider?: string;
  model?: string;
}

interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  kind: SkillVersionKind;
  note: string;
  created_at: string;
  snapshot_json: string;
  sources_json: string;
  provider: string | null;
  model: string | null;
}

function rowToRecord(row: SkillVersionRow): SkillVersionRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    version: row.version,
    kind: row.kind,
    note: row.note,
    createdAt: row.created_at,
    snapshot: JSON.parse(row.snapshot_json) as SkillSnapshot,
    sources: JSON.parse(row.sources_json) as StoredSource[],
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
  };
}

export interface NewSkillVersion {
  skillId: string;
  userId: string;
  kind: SkillVersionKind;
  note?: string;
  snapshot: SkillSnapshot;
  sources?: StoredSource[];
  provider?: string;
  model?: string;
}

/** Appends the skill's next version (1, 2, 3…). */
export function insertSkillVersion(input: NewSkillVersion): SkillVersionRecord {
  const db = getDb();
  return db.transaction(() => {
    const { next } = db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next FROM skill_versions WHERE skill_id = ?",
      )
      .get(input.skillId) as { next: number };
    const row: SkillVersionRow = {
      id: randomUUID(),
      skill_id: input.skillId,
      version: next,
      kind: input.kind,
      note: input.note?.trim() ?? "",
      created_at: new Date().toISOString(),
      snapshot_json: JSON.stringify(input.snapshot),
      sources_json: JSON.stringify(
        (input.sources ?? []).map(({ kind, id, added }) =>
          added ? { kind, id, added: true } : { kind, id },
        ),
      ),
      provider: input.provider ?? null,
      model: input.model ?? null,
    };
    db.prepare(
      `INSERT INTO skill_versions (id, skill_id, version, user_id, kind, note, snapshot_json,
         sources_json, provider, model, created_at)
       VALUES (@id, @skill_id, @version, @user_id, @kind, @note, @snapshot_json,
         @sources_json, @provider, @model, @created_at)`,
    ).run({ ...row, user_id: input.userId });
    return rowToRecord(row);
  })();
}

/** Newest first. */
export function listSkillVersions(skillId: string): SkillVersionRecord[] {
  return (
    getDb()
      .prepare(
        "SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC",
      )
      .all(skillId) as SkillVersionRow[]
  ).map(rowToRecord);
}

export function getSkillVersion(
  skillId: string,
  id: string,
): SkillVersionRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM skill_versions WHERE skill_id = ? AND id = ?")
    .get(skillId, id) as SkillVersionRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function countSkillVersions(skillId: string): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM skill_versions WHERE skill_id = ?")
      .get(skillId) as { n: number }
  ).n;
}

/** Cached notes of one training source (see `digests.ts`); null when not read yet. */
export function getDigest(key: string): SourceDigest | null {
  const row = getDb()
    .prepare("SELECT digest_json FROM training_digests WHERE key = ?")
    .get(key) as { digest_json: string } | undefined;
  return row ? (JSON.parse(row.digest_json) as SourceDigest) : null;
}

export function saveDigest(key: string, digest: SourceDigest): void {
  getDb()
    .prepare(
      `INSERT INTO training_digests (key, digest_json, created_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET digest_json = excluded.digest_json, created_at = excluded.created_at`,
    )
    .run(key, JSON.stringify(digest), new Date().toISOString());
}
