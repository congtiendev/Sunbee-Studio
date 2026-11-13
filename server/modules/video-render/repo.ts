import { randomUUID } from "node:crypto";
import { DEFAULT_FRAME_RATIO, isFrameRatio } from "../../../shared/frame-ratio.js";
import type {
  RenderManifest,
  RenderManifestAudioCue,
  RenderProject,
  RenderProjectSummary,
  RenderProjectUpdate,
  RenderScene,
  RenderSourceMode,
  RenderSourceOptions,
  VideoRender,
} from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";

export const SOURCE_MODES: RenderSourceMode[] = ["script", "link", "upload", "document", "idea", "template"];

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  frame_ratio: string;
  source_mode: string;
  source_options_json: string;
  idea_text: string;
  target_duration_sec: number | null;
  script_text: string;
  scenes_json: string;
  audio_json: string;
  created_at: string;
  updated_at: string;
  owner_email: string | null;
}

const SELECT_PROJECTS = `
  SELECT rp.*, u.email AS owner_email
  FROM render_projects rp
  LEFT JOIN users u ON u.id = rp.user_id
`;

function rowToProject(row: ProjectRow): RenderProject {
  return {
    id: row.id,
    name: row.name,
    frameRatio: isFrameRatio(row.frame_ratio) ? row.frame_ratio : DEFAULT_FRAME_RATIO,
    sourceMode: SOURCE_MODES.includes(row.source_mode as RenderSourceMode)
      ? (row.source_mode as RenderSourceMode)
      : "script",
    sourceOptions: JSON.parse(row.source_options_json) as RenderSourceOptions,
    ideaText: row.idea_text,
    targetDurationSec: row.target_duration_sec,
    scriptText: row.script_text,
    scenes: JSON.parse(row.scenes_json) as RenderScene[],
    audio: JSON.parse(row.audio_json) as RenderManifestAudioCue[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerEmail: row.owner_email ?? undefined,
  };
}

function toSummary(project: RenderProject): RenderProjectSummary {
  return {
    id: project.id,
    name: project.name,
    frameRatio: project.frameRatio,
    sceneCount: project.scenes.length,
    durationSec: Math.round(project.scenes.reduce((sum, scene) => sum + scene.durationSec, 0)),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ownerEmail: project.ownerEmail,
  };
}

export function listRenderProjects(userId: string, isAdmin: boolean): RenderProjectSummary[] {
  const rows = isAdmin
    ? (getDb().prepare(`${SELECT_PROJECTS} ORDER BY rp.updated_at DESC`).all() as ProjectRow[])
    : (getDb()
        .prepare(`${SELECT_PROJECTS} WHERE rp.user_id = ? ORDER BY rp.updated_at DESC`)
        .all(userId) as ProjectRow[]);
  return rows.map((row) => toSummary(rowToProject(row)));
}

/** The project if the caller owns it (admins: any), else null. */
export function getRenderProject(userId: string, isAdmin: boolean, id: string): RenderProject | null {
  const row = getDb().prepare(`${SELECT_PROJECTS} WHERE rp.id = ?`).get(id) as ProjectRow | undefined;
  if (!row || (!isAdmin && row.user_id !== userId)) return null;
  return rowToProject(row);
}

/** The owner of a project the caller may access (renders are saved under the owner). */
export function renderProjectOwner(id: string): string | null {
  const row = getDb().prepare("SELECT user_id FROM render_projects WHERE id = ?").get(id) as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}

export function createRenderProject(userId: string, name: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO render_projects (id, user_id, name, frame_ratio, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, name, DEFAULT_FRAME_RATIO, now, now);
  return id;
}

/** Applies the given fields only; anything left out keeps its value. */
export function updateRenderProject(id: string, patch: RenderProjectUpdate): void {
  const columns: Record<string, unknown> = {};
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.frameRatio !== undefined) columns.frame_ratio = patch.frameRatio;
  if (patch.sourceMode !== undefined) columns.source_mode = patch.sourceMode;
  if (patch.sourceOptions !== undefined) columns.source_options_json = JSON.stringify(patch.sourceOptions);
  if (patch.ideaText !== undefined) columns.idea_text = patch.ideaText;
  if (patch.targetDurationSec !== undefined) columns.target_duration_sec = patch.targetDurationSec;
  if (patch.scriptText !== undefined) columns.script_text = patch.scriptText;
  if (patch.scenes !== undefined) columns.scenes_json = JSON.stringify(patch.scenes);
  if (patch.audio !== undefined) columns.audio_json = JSON.stringify(patch.audio);
  columns.updated_at = new Date().toISOString();
  const assignments = Object.keys(columns).map((column) => `${column} = @${column}`);
  getDb()
    .prepare(`UPDATE render_projects SET ${assignments.join(", ")} WHERE id = @id`)
    .run({ ...columns, id });
}

/** Deletes the project and its render history rows; returns the rendered files' ids so the caller can remove them. */
export function deleteRenderProject(id: string): string[] {
  const db = getDb();
  const fileIds = (
    db.prepare("SELECT file_id FROM render_outputs WHERE project_id = ?").all(id) as { file_id: string }[]
  ).map((row) => row.file_id);
  db.transaction(() => {
    db.prepare("DELETE FROM render_outputs WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM render_projects WHERE id = ?").run(id);
  })();
  return fileIds;
}

interface OutputRow {
  id: string;
  project_id: string;
  file_id: string;
  duration_ms: number;
  created_at: string;
}

function rowToRender(row: OutputRow): VideoRender {
  return {
    id: row.id,
    projectId: row.project_id,
    fileId: row.file_id,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

/** Append-only render history for a project, newest first. */
export function listVideoRenders(projectId: string): VideoRender[] {
  return (
    getDb()
      .prepare(
        `SELECT id, project_id, file_id, duration_ms, created_at
         FROM render_outputs WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as OutputRow[]
  ).map(rowToRender);
}

export function insertVideoRender(
  userId: string,
  projectId: string,
  fileId: string,
  manifest: RenderManifest,
  durationMs: number,
): VideoRender {
  const row: OutputRow = {
    id: randomUUID(),
    project_id: projectId,
    file_id: fileId,
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO render_outputs (id, user_id, project_id, file_id, manifest_json, duration_ms, created_at)
       VALUES (@id, @userId, @project_id, @file_id, @manifest_json, @duration_ms, @created_at)`,
    )
    .run({ ...row, userId, manifest_json: JSON.stringify(manifest) });
  return rowToRender(row);
}
