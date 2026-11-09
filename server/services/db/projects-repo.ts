import { randomUUID } from "node:crypto";
import type { Project } from "../../../shared/types.js";
import { getDb } from "./client.js";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  owner_email: string | null;
  category_count: number;
  video_count: number;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    categoryCount: row.category_count,
    videoCount: row.video_count,
  };
}

/** Live projects with counts of their live categories and videos. */
const SELECT_PROJECTS = `
  SELECT p.id, p.name, p.created_at, p.updated_at, p.user_id, u.email AS owner_email,
    (SELECT COUNT(*) FROM categories c
       WHERE c.project_id = p.id AND c.deleted_at IS NULL) AS category_count,
    (SELECT COUNT(*) FROM videos v
       JOIN categories c ON c.id = v.category_id
       WHERE c.project_id = p.id AND c.deleted_at IS NULL AND v.deleted_at IS NULL) AS video_count
  FROM projects p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.deleted_at IS NULL
`;

export function listProjects(userId: string, isAdmin: boolean): Project[] {
  const rows = isAdmin
    ? (getDb()
        .prepare(`${SELECT_PROJECTS} ORDER BY p.updated_at DESC`)
        .all() as ProjectRow[])
    : (getDb()
        .prepare(
          `${SELECT_PROJECTS} AND p.user_id = ? ORDER BY p.updated_at DESC`,
        )
        .all(userId) as ProjectRow[]);

  return rows.map(rowToProject);
}

export function getProject(
  userId: string,
  isAdmin: boolean,
  id: string,
): Project | null {
  const row = isAdmin
    ? (getDb().prepare(`${SELECT_PROJECTS} AND p.id = ?`).get(id) as
        ProjectRow | undefined)
    : (getDb()
        .prepare(`${SELECT_PROJECTS} AND p.id = ? AND p.user_id = ?`)
        .get(id, userId) as ProjectRow | undefined);
  return row ? rowToProject(row) : null;
}

export function createProject(userId: string, name: string): Project {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO projects (id, user_id, name, created_at, updated_at)
       VALUES (@id, @userId, @name, @createdAt, @updatedAt)`,
    )
    .run({
      id: record.id,
      userId,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

  return { ...record, userId, categoryCount: 0, videoCount: 0 };
}

export function touchProject(id: string): void {
  getDb()
    .prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

export function renameProject(
  userId: string,
  isAdmin: boolean,
  id: string,
  name: string,
): void {
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, new Date().toISOString(), id);
  } else {
    getDb()
      .prepare(
        `UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(name, new Date().toISOString(), id, userId);
  }
}

export function softDeleteProject(
  userId: string,
  isAdmin: boolean,
  id: string,
): void {
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE projects SET deleted_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  } else {
    getDb()
      .prepare(
        `UPDATE projects SET deleted_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(new Date().toISOString(), id, userId);
  }
}
