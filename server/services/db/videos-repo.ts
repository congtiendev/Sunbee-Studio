import { randomUUID } from "node:crypto";
import { isFrameRatio } from "../../../shared/frame-ratio.js";
import type { FrameRatio, Video, VideoSummary } from "../../../shared/types.js";
import { getDb } from "./client.js";

interface VideoRow {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  frame_ratio: string | null;
  script_version_id: string | null;
  target_duration_sec: number | null;
  voice_profile_id: string | null;
  graphics_skill_id: string | null;
  steps_json: string | null;
  edit_skill_id: string | null;
  owner_email: string | null;
  category_name: string;
  project_id: string;
  project_name: string;
}

function rowToVideo(row: VideoRow): VideoSummary {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    frameRatio: isFrameRatio(row.frame_ratio) ? row.frame_ratio : undefined,
    scriptVersionId: row.script_version_id ?? undefined,
    targetDurationSec: row.target_duration_sec ?? undefined,
    voiceProfileId: row.voice_profile_id ?? undefined,
    graphicsSkillId: row.graphics_skill_id ?? undefined,
    completedSteps: parseCompletedSteps(row.steps_json),
    editSkillId: row.edit_skill_id ?? undefined,
    categoryName: row.category_name,
    projectId: row.project_id,
    projectName: row.project_name,
  };
}

/**
 * Live videos joined with their category and project. A video counts as gone
 * when it, its category or its project is soft-deleted.
 */
const SELECT_VIDEOS = `
  SELECT v.id, v.category_id, v.name, v.created_at, v.updated_at, v.user_id, v.frame_ratio,
    v.script_version_id, v.target_duration_sec, v.voice_profile_id, v.graphics_skill_id, v.steps_json, v.edit_skill_id,
    u.email AS owner_email, c.name AS category_name, p.id AS project_id, p.name AS project_name
  FROM videos v
  JOIN categories c ON c.id = v.category_id AND c.deleted_at IS NULL
  JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
  LEFT JOIN users u ON u.id = v.user_id
  WHERE v.deleted_at IS NULL
`;

/** Runs SELECT_VIDEOS with an extra filter, scoped to the user's own rows unless admin. */
function queryVideos(
  userId: string,
  isAdmin: boolean,
  filter: string,
  params: unknown[],
  tail = "ORDER BY v.updated_at DESC",
): VideoSummary[] {
  const owner = isAdmin ? "" : "AND v.user_id = ?";
  const rows = getDb()
    .prepare(`${SELECT_VIDEOS} ${filter} ${owner} ${tail}`)
    .all(...params, ...(isAdmin ? [] : [userId])) as VideoRow[];
  return rows.map(rowToVideo);
}

export function listVideos(
  userId: string,
  isAdmin: boolean,
  categoryId: string,
): VideoSummary[] {
  return queryVideos(userId, isAdmin, "AND v.category_id = ?", [categoryId]);
}

export function listProjectVideos(
  userId: string,
  isAdmin: boolean,
  projectId: string,
): VideoSummary[] {
  return queryVideos(userId, isAdmin, "AND p.id = ?", [projectId]);
}

export function listRecentVideos(
  userId: string,
  isAdmin: boolean,
  limit: number,
): VideoSummary[] {
  return queryVideos(
    userId,
    isAdmin,
    "",
    [],
    `ORDER BY v.updated_at DESC LIMIT ${limit}`,
  );
}

export function getVideo(
  userId: string,
  isAdmin: boolean,
  id: string,
): VideoSummary | null {
  return queryVideos(userId, isAdmin, "AND v.id = ?", [id])[0] ?? null;
}

/**
 * Whether the user may work on this video: their own (or any, for admins), and
 * not soft-deleted along with its category/project. Same rule as `getVideo`.
 */
export function canAccessVideo(
  userId: string,
  isAdmin: boolean,
  videoId: string,
): boolean {
  return getVideo(userId, isAdmin, videoId) !== null;
}

export function createVideo(
  userId: string,
  categoryId: string,
  name: string,
): Video {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    categoryId,
    name,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO videos (id, category_id, user_id, name, created_at, updated_at)
       VALUES (@id, @categoryId, @userId, @name, @createdAt, @updatedAt)`,
    )
    .run({
      id: record.id,
      categoryId: record.categoryId,
      userId,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

  return { ...record, userId };
}

export function touchVideo(id: string): void {
  getDb()
    .prepare(`UPDATE videos SET updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export function renameVideo(
  userId: string,
  isAdmin: boolean,
  id: string,
  name: string,
): void {
  const now = new Date().toISOString();
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE videos SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, now, id);
  } else {
    getDb()
      .prepare(
        `UPDATE videos SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(name, now, id, userId);
  }
}

function parseCompletedSteps(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as { completed?: unknown };
    return Array.isArray(value.completed)
      ? value.completed.filter((step): step is string => typeof step === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

/** A video's pipeline settings; `null` clears one, an absent key leaves it as is. */
export interface VideoPipelinePatch {
  scriptVersionId?: string | null;
  targetDurationSec?: number | null;
  voiceProfileId?: string | null;
  graphicsSkillId?: string | null;
  completedSteps?: string[];
  editSkillId?: string | null;
}

/** Writes the given pipeline settings (caller has checked access). Doesn't touch `updated_at`: these are settings, not edits. */
export function updateVideoPipeline(id: string, patch: VideoPipelinePatch): void {
  const columns: [string, unknown][] = [];
  if (patch.scriptVersionId !== undefined) columns.push(["script_version_id", patch.scriptVersionId]);
  if (patch.targetDurationSec !== undefined) columns.push(["target_duration_sec", patch.targetDurationSec]);
  if (patch.voiceProfileId !== undefined) columns.push(["voice_profile_id", patch.voiceProfileId]);
  if (patch.graphicsSkillId !== undefined) columns.push(["graphics_skill_id", patch.graphicsSkillId]);
  if (patch.editSkillId !== undefined) columns.push(["edit_skill_id", patch.editSkillId]);
  if (patch.completedSteps !== undefined) {
    columns.push(["steps_json", JSON.stringify({ completed: [...new Set(patch.completedSteps)] })]);
  }
  if (columns.length === 0) return;
  getDb()
    .prepare(`UPDATE videos SET ${columns.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`)
    .run(...columns.map(([, value]) => value), id);
}

export function setVideoFrameRatio(
  userId: string,
  isAdmin: boolean,
  id: string,
  frameRatio: FrameRatio,
): void {
  const now = new Date().toISOString();
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE videos SET frame_ratio = ?, updated_at = ? WHERE id = ?`)
      .run(frameRatio, now, id);
  } else {
    getDb()
      .prepare(`UPDATE videos SET frame_ratio = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(frameRatio, now, id, userId);
  }
}

export function softDeleteVideo(
  userId: string,
  isAdmin: boolean,
  id: string,
): void {
  const now = new Date().toISOString();
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE videos SET deleted_at = ? WHERE id = ?`)
      .run(now, id);
  } else {
    getDb()
      .prepare(`UPDATE videos SET deleted_at = ? WHERE id = ? AND user_id = ?`)
      .run(now, id, userId);
  }
}
