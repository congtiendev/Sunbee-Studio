import { randomUUID } from "node:crypto";
import type {
  RecurringCharacter,
  RecurringObject,
  ScriptAnalysisListItem,
  ScriptAnalysisRecord,
  ScriptAnalysisSummary,
  ScriptAnalyzeResult,
  ScriptScene,
  ScriptSourceType,
} from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";
import { touchVideo } from "../../services/db/videos-repo.js";
import { ensureSceneIds } from "./schema.js";

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
  object_roster_json: string | null;
  kind: "draft" | "analyzed";
  video_id: string | null;
  approved: number;
  template_source_id: string | null;
  style_template_id: string | null;
  editing_style_template_id: string | null;
  provider: string | null;
  model: string | null;
  language: string | null;
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
    objectRoster: row.object_roster_json
      ? JSON.parse(row.object_roster_json)
      : undefined,
    videoId: row.video_id ?? undefined,
    approved: row.approved === 1,
    templateSourceId: row.template_source_id ?? undefined,
    styleTemplateId: row.style_template_id ?? undefined,
    editingStyleTemplateId: row.editing_style_template_id ?? undefined,
    provider: (row.provider as "openai" | "claude" | null) ?? undefined,
    model: row.model ?? undefined,
    language: (row.language as "vi" | "en" | null) ?? undefined,
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
    objectRoster?: RecurringObject[];
    styleTemplateId?: string;
    editingStyleTemplateId?: string;
    provider?: "openai" | "claude";
    model?: string;
    language?: "vi" | "en";
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
    // Every write path (analyze, template, approve, import…) gets its ids here.
    scenes: ensureSceneIds(result?.scenes ?? []),
    resources: result?.resources ?? EMPTY_RESOURCES,
    style: result?.style,
    characterRoster: options.characterRoster,
    objectRoster: options.objectRoster,
    videoId,
    approved: Boolean(options.approved),
    templateSourceId: options.templateSourceId,
    styleTemplateId: options.styleTemplateId,
    editingStyleTemplateId: options.editingStyleTemplateId,
    provider: options.provider,
    model: options.model,
    language: options.language,
  };

  getDb()
    .prepare(
      `INSERT INTO script_analyses (id, created_at, source_type, source_url, script_text, scenes_json, resources_json, style_json, frames_json, character_roster_json, object_roster_json, kind, video_id, approved, template_source_id, style_template_id, editing_style_template_id, provider, model, language, user_id)
       VALUES (@id, @createdAt, @sourceType, @sourceUrl, @scriptText, @scenesJson, @resourcesJson, @styleJson, @framesJson, @characterRosterJson, @objectRosterJson, @kind, @videoId, @approved, @templateSourceId, @styleTemplateId, @editingStyleTemplateId, @provider, @model, @language, @userId)`,
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
      objectRosterJson: record.objectRoster
        ? JSON.stringify(record.objectRoster)
        : null,
      kind: record.kind,
      videoId: record.videoId ?? null,
      approved: record.approved ? 1 : 0,
      templateSourceId: record.templateSourceId ?? null,
      styleTemplateId: record.styleTemplateId ?? null,
      editingStyleTemplateId: record.editingStyleTemplateId ?? null,
      provider: record.provider ?? null,
      model: record.model ?? null,
      language: record.language ?? null,
      userId,
    });

  if (videoId) touchVideo(videoId);

  return { ...record, userId };
}

/**
 * Overwrites the script text of an existing version in place — only when it's
 * still a "draft" (an "analyzed" version's scenes are tied to its original
 * text, so that one is never rewritten under them). Null means "fork a new
 * draft instead": not found, not owned, or already "analyzed".
 */
export function updateDraftScriptText(
  userId: string,
  isAdmin: boolean,
  id: string,
  scriptText: string,
): ScriptAnalysisRecord | null {
  const existing = getScriptAnalysisById(userId, isAdmin, id);
  if (!existing || existing.kind !== "draft") return null;
  const result = isAdmin
    ? getDb()
        .prepare(`UPDATE script_analyses SET script_text = ? WHERE id = ?`)
        .run(scriptText, id)
    : getDb()
        .prepare(
          `UPDATE script_analyses SET script_text = ? WHERE id = ? AND user_id = ?`,
        )
        .run(scriptText, id, userId);
  if (result.changes === 0) return null;
  return getScriptAnalysisById(userId, isAdmin, id);
}

/**
 * Overwrites an "analyzed" version's scenes in place — no new version, no
 * history entry. Used only by annotation passes over already-analyzed scenes
 * (shot/layer planning, asset prompts) that enrich the existing breakdown
 * rather than re-deciding it, so re-running one doesn't pile up versions
 * nobody asked to keep. Null means not found or not owned.
 */
export function updateAnalyzedScenes(
  userId: string,
  isAdmin: boolean,
  id: string,
  scenes: ScriptScene[],
): ScriptAnalysisRecord | null {
  const existing = getScriptAnalysisById(userId, isAdmin, id);
  if (!existing || existing.kind !== "analyzed") return null;
  const scenesJson = JSON.stringify(ensureSceneIds(scenes));
  const result = isAdmin
    ? getDb()
        .prepare(`UPDATE script_analyses SET scenes_json = ? WHERE id = ?`)
        .run(scenesJson, id)
    : getDb()
        .prepare(
          `UPDATE script_analyses SET scenes_json = ? WHERE id = ? AND user_id = ?`,
        )
        .run(scenesJson, id, userId);
  if (result.changes === 0) return null;
  return getScriptAnalysisById(userId, isAdmin, id);
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
         sa.character_roster_json, sa.object_roster_json, sa.kind,
         sa.video_id, sa.approved, sa.template_source_id, sa.style_template_id,
         sa.editing_style_template_id, sa.provider, sa.model, sa.language,
         sa.user_id, u.email AS owner_email
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

/** A video's versions, newest first — all of them for an admin (who may open anyone's video), else the user's own. */
export function listVersionsForVideo(
  userId: string,
  isAdmin: boolean,
  videoId: string,
): ScriptAnalysisRecord[] {
  const rows = (
    isAdmin
      ? getDb()
          .prepare(`${SELECT_BASE} WHERE sa.video_id = ? ORDER BY sa.created_at DESC`)
          .all(videoId)
      : getDb()
          .prepare(
            `${SELECT_BASE} WHERE sa.video_id = ? AND sa.user_id = ? ORDER BY sa.created_at DESC`,
          )
          .all(videoId, userId)
  ) as ScriptAnalysisRow[];

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
