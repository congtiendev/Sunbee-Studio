import { randomUUID } from "node:crypto";
import type { Category } from "../../../shared/types.js";
import { getDb } from "./client.js";

interface CategoryRow {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  owner_email: string | null;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function listCategories(
  userId: string,
  isAdmin: boolean,
  projectId: string,
): Category[] {
  const base = `
    SELECT c.id, c.project_id, c.name, c.created_at, c.updated_at, c.user_id, u.email AS owner_email
    FROM categories c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.project_id = ? AND c.deleted_at IS NULL
  `;
  const rows = isAdmin
    ? (getDb()
        .prepare(`${base} ORDER BY c.created_at ASC`)
        .all(projectId) as CategoryRow[])
    : (getDb()
        .prepare(`${base} AND c.user_id = ? ORDER BY c.created_at ASC`)
        .all(projectId, userId) as CategoryRow[]);

  return rows.map(rowToCategory);
}

/**
 * A live category the user may work in: their own (or any, for admins), and
 * neither it nor its project soft-deleted. Null otherwise.
 */
export function getCategory(
  userId: string,
  isAdmin: boolean,
  id: string,
): Category | null {
  const base = `
    SELECT c.id, c.project_id, c.name, c.created_at, c.updated_at, c.user_id, u.email AS owner_email
    FROM categories c
    JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `;
  const row = isAdmin
    ? (getDb().prepare(base).get(id) as CategoryRow | undefined)
    : (getDb().prepare(`${base} AND c.user_id = ?`).get(id, userId) as
        CategoryRow | undefined);
  return row ? rowToCategory(row) : null;
}

export function createCategory(
  userId: string,
  projectId: string,
  name: string,
): Category {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    projectId,
    name,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO categories (id, project_id, user_id, name, created_at, updated_at)
       VALUES (@id, @projectId, @userId, @name, @createdAt, @updatedAt)`,
    )
    .run({
      id: record.id,
      projectId: record.projectId,
      userId,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

  return { ...record, userId };
}

export function renameCategory(
  userId: string,
  isAdmin: boolean,
  id: string,
  name: string,
): void {
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE categories SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, new Date().toISOString(), id);
  } else {
    getDb()
      .prepare(
        `UPDATE categories SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(name, new Date().toISOString(), id, userId);
  }
}

export function softDeleteCategory(
  userId: string,
  isAdmin: boolean,
  id: string,
): void {
  if (isAdmin) {
    getDb()
      .prepare(`UPDATE categories SET deleted_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  } else {
    getDb()
      .prepare(
        `UPDATE categories SET deleted_at = ? WHERE id = ? AND user_id = ?`,
      )
      .run(new Date().toISOString(), id, userId);
  }
}
