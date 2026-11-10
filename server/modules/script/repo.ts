import { randomUUID } from "node:crypto";
import type {
  RecurringCharacter,
  ScriptAnalysisListItem,
  ScriptAnalysisRecord,
  ScriptAnalysisSummary,
  ScriptAnalyzeResult,
  ScriptSourceType,
} from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";
import { touchVideo } from "../../services/db/videos-repo.js";

interface ScriptAnalysisRow {
  id: string;
  created_at: string;
  source_type: ScriptSourceType;
  source_url: string | null;
  script_text: string;
  scenes_json: string;
  resources_json: string;
  style_json: string | null;
  frames_json: string | null;
  character_roster_json: string | null;
  kind: "draft" | "analyzed";
  video_id: string | null;
  approved: number;
  template_source_id: string | null;
  user_id: string | null;
  owner_email: string | null;
}

const EMPTY_RESOURCES = {
  shotCount: 0,
  voiceover: "",
  music: "",
  images: [] as string[],
  notes: "",
};

function rowToRecord(row: ScriptAnalysisRow): ScriptAnalysisRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    scriptText: row.script_text,
    frames: row.frames_json ? JSON.parse(row.frames_json) : [],
    kind: row.kind,
    scenes: JSON.parse(row.scenes_json),
    resources: JSON.parse(row.resources_json),
    style: row.style_json ? JSON.parse(row.style_json) : undefined,
    characterRoster: row.character_roster_json
      ? JSON.parse(row.character_roster_json)
      : undefined,
    videoId: row.video_id ?? undefined,
    approved: row.approved === 1,
    templateSourceId: row.template_source_id ?? undefined,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function saveScriptVersion(
  userId: string,
  sourceType: ScriptSourceType,
  sourceUrl: string | undefined,
  scriptText: string,
  frames: string[],
  kind: "draft" | "analyzed",
  result?: ScriptAnalyzeResult,
  videoId?: string,
  options: {
    approved?: boolean;
    templateSourceId?: string;
    characterRoster?: RecurringCharacter[];
  } = {},
): ScriptAnalysisRecord {
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceType,
    sourceUrl,
    scriptText,
    frames,
    kind,
    scenes: result?.scenes ?? [],
    resources: result?.resources ?? EMPTY_RESOURCES,
    style: result?.style,
    characterRoster: options.characterRoster,
    videoId,
    approved: Boolean(options.approved),
    templateSourceId: options.templateSourceId,
  };

  getDb()
    .prepare(
      `INSERT INTO script_analyses (id, created_at, source_type, source_url, script_text, scenes_json, resources_json, style_json, frames_json, character_roster_json, kind, video_id, approved, template_source_id, user_id)
       VALUES (@id, @createdAt, @sourceType, @sourceUrl, @scriptText, @scenesJson, @resourcesJson, @styleJson, @framesJson, @characterRosterJson, @kind, @videoId, @approved, @templateSourceId, @userId)`,
    )
    .run({
      id: record.id,
      createdAt: record.createdAt,
      sourceType: record.sourceType,
      sourceUrl: record.sourceUrl ?? null,
      scriptText: record.scriptText,
      scenesJson: JSON.stringify(record.scenes),
      resourcesJson: JSON.stringify(record.resources),
      styleJson: record.style ? JSON.stringify(record.style) : null,
      framesJson: JSON.stringify(record.frames),
      characterRosterJson: record.characterRoster
        ? JSON.stringify(record.characterRoster)
        : null,
      kind: record.kind,
      videoId: record.videoId ?? null,
      approved: record.approved ? 1 : 0,
      templateSourceId: record.templateSourceId ?? null,
      userId,
    });

  if (videoId) touchVideo(videoId);

  return { ...record, userId };
}

export function deleteScriptAnalysis(
  userId: string,
  isAdmin: boolean,
  id: string,
): void {
  if (isAdmin) {
    getDb().prepare(`DELETE FROM script_analyses WHERE id = ?`).run(id);
  } else {
    getDb()
      .prepare(`DELETE FROM script_analyses WHERE id = ? AND user_id = ?`)
      .run(id, userId);
  }
}

const SELECT_BASE = `
  SELECT sa.id, sa.created_at, sa.source_type, sa.source_url, sa.script_text,
         sa.scenes_json, sa.resources_json, sa.style_json, sa.frames_json,
         sa.character_roster_json, sa.kind,
         sa.video_id, sa.approved, sa.template_source_id, sa.user_id, u.email AS owner_email
  FROM script_analyses sa
  LEFT JOIN users u ON u.id = sa.user_id
`;

export function listScriptAnalyses(
  userId: string,
  isAdmin: boolean,
): ScriptAnalysisRecord[] {
  const rows = isAdmin
    ? (getDb()
        .prepare(`${SELECT_BASE} ORDER BY sa.created_at DESC`)
        .all() as ScriptAnalysisRow[])
    : (getDb()
        .prepare(
          `${SELECT_BASE} WHERE sa.user_id = ? ORDER BY sa.created_at DESC`,
        )
        .all(userId) as ScriptAnalysisRow[]);

  return rows.map(rowToRecord);
}

interface ListItemRow {
  id: string;
  created_at: string;
  source_type: ScriptSourceType;
  source_url: string | null;
  kind: "draft" | "analyzed";
  scenes_json: string;
  video_id: string | null;
  owner_email: string | null;
}

/**
 * Same rows as `listScriptAnalyses` but without script_text/frames_json/
 * resources_json/style_json — the big blobs a dashboard/admin list never
 * renders. Use `listScriptAnalyses` only where the full body is needed
 * (export/backup, the MCP tool).
 */
export function listScriptAnalysesLight(
  userId: string,
  isAdmin: boolean,
): ScriptAnalysisListItem[] {
  const select = `
    SELECT sa.id, sa.created_at, sa.source_type, sa.source_url, sa.kind,
           sa.scenes_json, sa.video_id, u.email AS owner_email
    FROM script_analyses sa
    LEFT JOIN users u ON u.id = sa.user_id
  `;
  const rows = isAdmin
    ? (getDb()
        .prepare(`${select} ORDER BY sa.created_at DESC`)
        .all() as ListItemRow[])
    : (getDb()
        .prepare(`${select} WHERE sa.user_id = ? ORDER BY sa.created_at DESC`)
        .all(userId) as ListItemRow[]);

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    kind: row.kind,
    sceneCount: (JSON.parse(row.scenes_json) as unknown[]).length,
    videoId: row.video_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  }));
}

export function listVersionsForVideo(
  userId: string,
  videoId: string,
): ScriptAnalysisRecord[] {
  const rows = getDb()
    .prepare(
      `${SELECT_BASE} WHERE sa.video_id = ? AND sa.user_id = ? ORDER BY sa.created_at DESC`,
    )
    .all(videoId, userId) as ScriptAnalysisRow[];

  return rows.map(rowToRecord);
}

export function getScriptAnalysisById(
  userId: string,
  isAdmin: boolean,
  id: string,
): ScriptAnalysisRecord | null {
  const row = isAdmin
    ? (getDb().prepare(`${SELECT_BASE} WHERE sa.id = ?`).get(id) as
        ScriptAnalysisRow | undefined)
    : (getDb()
        .prepare(`${SELECT_BASE} WHERE sa.id = ? AND sa.user_id = ?`)
        .get(id, userId) as ScriptAnalysisRow | undefined);
  return row ? rowToRecord(row) : null;
}

/** Only the given ids that the caller may read, in the given order. */
export function getScriptAnalysesByIds(
  userId: string,
  isAdmin: boolean,
  ids: string[],
): ScriptAnalysisRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = isAdmin
    ? (getDb()
        .prepare(`${SELECT_BASE} WHERE sa.id IN (${placeholders})`)
        .all(...ids) as ScriptAnalysisRow[])
    : (getDb()
        .prepare(
          `${SELECT_BASE} WHERE sa.id IN (${placeholders}) AND sa.user_id = ?`,
        )
        .all(...ids, userId) as ScriptAnalysisRow[]);

  const byId = new Map(rows.map((row) => [row.id, rowToRecord(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

interface SummaryRow {
  id: string;
  created_at: string;
  source_type: ScriptSourceType;
  source_url: string | null;
  script_text: string;
  scenes_json: string;
  style_json: string | null;
  video_id: string | null;
  video_name: string | null;
  approved: number;
}

export function toSummary(row: SummaryRow): ScriptAnalysisSummary {
  const style = row.style_json
    ? (JSON.parse(row.style_json) as { genre?: string })
    : undefined;
  return {
    id: row.id,
    createdAt: row.created_at,
    sourceType: row.source_type,
    sourceUrl: row.source_url ?? undefined,
    scriptExcerpt: row.script_text.slice(0, 200),
    sceneCount: (JSON.parse(row.scenes_json) as unknown[]).length,
    genre: style?.genre,
    videoId: row.video_id ?? undefined,
    videoName: row.video_name ?? undefined,
    approved: row.approved === 1,
  };
}

/** Analyzed versions the user may pick as examples/templates (approved first, newest first). */
export function listAnalyzedSummaries(
  userId: string,
  options: { approvedOnly?: boolean } = {},
): ScriptAnalysisSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT sa.id, sa.created_at, sa.source_type, sa.source_url, sa.script_text, sa.scenes_json,
              sa.style_json, sa.video_id, v.name AS video_name, sa.approved
       FROM script_analyses sa
       LEFT JOIN videos v ON v.id = sa.video_id
       WHERE sa.user_id = ? AND sa.kind = 'analyzed' ${options.approvedOnly ? "AND sa.approved = 1" : ""}
       ORDER BY sa.approved DESC, sa.created_at DESC`,
    )
    .all(userId) as SummaryRow[];
  return rows.map(toSummary);
}
