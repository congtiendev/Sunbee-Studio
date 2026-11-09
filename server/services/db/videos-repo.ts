import { randomUUID } from "node:crypto";
import type { Video } from "../../../shared/types.js";
import { getDb } from "./client.js";

interface VideoRow {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  owner_email: string | null;
}

function rowToVideo(row: VideoRow): Video {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function listVideos(
  userId: string,
  isAdmin: boolean,
  categoryId: string,
): Video[] {
  const base = `
    SELECT v.id, v.category_id, v.name, v.created_at, v.updated_at, v.user_id, u.email AS owner_email
    FROM videos v
    LEFT JOIN users u ON u.id = v.user_id
    WHERE v.category_id = ?
  `;
  const rows = isAdmin
    ? (getDb()
        .prepare(`${base} ORDER BY v.updated_at DESC`)
        .all(categoryId) as VideoRow[])
    : (getDb()
        .prepare(`${base} AND v.user_id = ? ORDER BY v.updated_at DESC`)
        .all(categoryId, userId) as VideoRow[]);

  return rows.map(rowToVideo);
}

/** Whether the user may work on this video (owner, or any video for admins). */
export function canAccessVideo(userId: string, isAdmin: boolean, videoId: string): boolean {
  const row = getDb().prepare("SELECT user_id FROM videos WHERE id = ?").get(videoId) as
    | { user_id: string | null }
    | undefined;
  return Boolean(row && (isAdmin || row.user_id === userId));
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
