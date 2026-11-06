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
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function listProjects(userId: string, isAdmin: boolean): Project[] {
  const base = `
    SELECT p.id, p.name, p.created_at, p.updated_at, p.user_id, u.email AS owner_email
    FROM projects p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.deleted_at IS NULL
  `;
  const rows = isAdmin
    ? (getDb()
        .prepare(`${base} ORDER BY p.updated_at DESC`)
        .all() as ProjectRow[])
    : (getDb()
        .prepare(`${base} AND p.user_id = ? ORDER BY p.updated_at DESC`)
        .all(userId) as ProjectRow[]);

  return rows.map(rowToProject);
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
    .run({ id: record.id, userId, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt });

  return { ...record, userId };
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
