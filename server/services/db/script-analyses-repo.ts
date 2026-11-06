import { randomUUID } from "node:crypto";
import type {
  ScriptAnalysisRecord,
  ScriptAnalyzeResult,
} from "../../../shared/types.js";
import { getDb } from "./client.js";
import { touchVideo } from "./videos-repo.js";

interface ScriptAnalysisRow {
  id: string;
  created_at: string;
  source_type: "youtube" | "import";
  source_url: string | null;
  script_text: string;
  scenes_json: string;
  resources_json: string;
  style_json: string | null;
  frames_json: string | null;
  kind: "draft" | "analyzed";
  video_id: string | null;
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
    videoId: row.video_id ?? undefined,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function saveScriptVersion(
  userId: string,
  sourceType: "youtube" | "import",
  sourceUrl: string | undefined,
  scriptText: string,
  frames: string[],
  kind: "draft" | "analyzed",
  result?: ScriptAnalyzeResult,
  videoId?: string,
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
    videoId,
  };

  getDb()
    .prepare(
      `INSERT INTO script_analyses (id, created_at, source_type, source_url, script_text, scenes_json, resources_json, style_json, frames_json, kind, video_id, user_id)
       VALUES (@id, @createdAt, @sourceType, @sourceUrl, @scriptText, @scenesJson, @resourcesJson, @styleJson, @framesJson, @kind, @videoId, @userId)`,
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
      kind: record.kind,
      videoId: record.videoId ?? null,
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
         sa.scenes_json, sa.resources_json, sa.style_json, sa.frames_json, sa.kind,
         sa.video_id, sa.user_id, u.email AS owner_email
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
        .prepare(`${SELECT_BASE} WHERE sa.user_id = ? ORDER BY sa.created_at DESC`)
        .all(userId) as ScriptAnalysisRow[]);

  return rows.map(rowToRecord);
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
