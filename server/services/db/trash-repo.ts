import type {
  TrashItem,
  TrashItemType,
  TrashPurgeResult,
} from "../../../shared/types.js";
import { getDb } from "./client.js";

interface TrashRow {
  id: string;
  name: string;
  deleted_at: string;
  user_id: string | null;
  owner_email: string | null;
  parent_label: string | null;
}

const SELECTS: Record<TrashItemType, string> = {
  project: `
    SELECT p.id, p.name, p.deleted_at, p.user_id, u.email AS owner_email, NULL AS parent_label
    FROM projects p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.deleted_at IS NOT NULL
  `,
  category: `
    SELECT c.id, c.name, c.deleted_at, c.user_id, u.email AS owner_email, p.name AS parent_label
    FROM categories c
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE c.deleted_at IS NOT NULL
  `,
  video: `
    SELECT v.id, v.name, v.deleted_at, v.user_id, u.email AS owner_email,
      (p.name || ' / ' || c.name) AS parent_label
    FROM videos v
    LEFT JOIN users u ON u.id = v.user_id
    LEFT JOIN categories c ON c.id = v.category_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE v.deleted_at IS NOT NULL
  `,
};

function rowToItem(type: TrashItemType, row: TrashRow): TrashItem {
  return {
    type,
    id: row.id,
    name: row.name,
    deletedAt: row.deleted_at,
    ownerEmail: row.owner_email ?? undefined,
    parentLabel: row.parent_label ?? undefined,
  };
}

/** Every soft-deleted project, category and video — their own, or everyone's for an admin. */
export function listTrash(userId: string, isAdmin: boolean): TrashItem[] {
  const db = getDb();
  const items = (Object.keys(SELECTS) as TrashItemType[]).flatMap((type) => {
    const base = SELECTS[type];
    const rows = isAdmin
      ? (db.prepare(base).all() as TrashRow[])
      : (db.prepare(`${base} AND user_id = ?`).all(userId) as TrashRow[]);
    return rows.map((row) => rowToItem(type, row));
  });
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** The row's owner, or null if it doesn't exist — for the ownership check before restore/purge. */
function ownerOf(type: TrashItemType, id: string): string | null {
  const table =
    type === "project"
      ? "projects"
      : type === "category"
        ? "categories"
        : "videos";
  const row = getDb()
    .prepare(`SELECT user_id FROM ${table} WHERE id = ?`)
    .get(id) as { user_id: string | null } | undefined;
  return row?.user_id ?? null;
}

function canActOn(
  userId: string,
  isAdmin: boolean,
  type: TrashItemType,
  id: string,
): boolean {
  const owner = ownerOf(type, id);
  return owner !== null && (isAdmin || owner === userId);
}

/**
 * Un-deletes one item and, since a video/category counts as gone when its
 * parent is deleted too (see `videos-repo.ts`), restores its deleted
 * ancestors as well — otherwise restoring it would visibly do nothing.
 */
export function restoreTrashItem(
  userId: string,
  isAdmin: boolean,
  type: TrashItemType,
  id: string,
): boolean {
  if (!canActOn(userId, isAdmin, type, id)) return false;
  const db = getDb();

  if (type === "project") {
    db.prepare(`UPDATE projects SET deleted_at = NULL WHERE id = ?`).run(id);
  } else if (type === "category") {
    const row = db
      .prepare(`SELECT project_id FROM categories WHERE id = ?`)
      .get(id) as { project_id: string } | undefined;
    db.prepare(`UPDATE categories SET deleted_at = NULL WHERE id = ?`).run(id);
    if (row) {
      db.prepare(
        `UPDATE projects SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
      ).run(row.project_id);
    }
  } else {
    const row = db
      .prepare(`SELECT category_id FROM videos WHERE id = ?`)
      .get(id) as { category_id: string } | undefined;
    db.prepare(`UPDATE videos SET deleted_at = NULL WHERE id = ?`).run(id);
    if (row) {
      const category = db
        .prepare(`SELECT project_id FROM categories WHERE id = ?`)
        .get(row.category_id) as { project_id: string } | undefined;
      db.prepare(
        `UPDATE categories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
      ).run(row.category_id);
      if (category) {
        db.prepare(
          `UPDATE projects SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
        ).run(category.project_id);
      }
    }
  }
  return true;
}

function purgeVideoRows(
  db: ReturnType<typeof getDb>,
  videoId: string,
  result: TrashPurgeResult,
): void {
  result.scriptAnalyses += db
    .prepare(`DELETE FROM script_analyses WHERE video_id = ?`)
    .run(videoId).changes;
  result.sceneResources += db
    .prepare(`DELETE FROM scene_resources WHERE video_id = ?`)
    .run(videoId).changes;
  result.assetPrompts += db
    .prepare(`DELETE FROM asset_prompts WHERE video_id = ?`)
    .run(videoId).changes;
  db.prepare(`DELETE FROM videos WHERE id = ?`).run(videoId);
  result.videos += 1;
}

function purgeCategoryRows(
  db: ReturnType<typeof getDb>,
  categoryId: string,
  result: TrashPurgeResult,
): void {
  const videoIds = (
    db
      .prepare(`SELECT id FROM videos WHERE category_id = ?`)
      .all(categoryId) as { id: string }[]
  ).map((row) => row.id);
  for (const videoId of videoIds) purgeVideoRows(db, videoId, result);
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(categoryId);
  result.categories += 1;
}

function emptyResult(): TrashPurgeResult {
  return {
    projects: 0,
    categories: 0,
    videos: 0,
    scriptAnalyses: 0,
    sceneResources: 0,
    assetPrompts: 0,
  };
}

/**
 * Permanently deletes one trashed item and everything under it (a project's
 * categories and videos, a category's videos, and every video's script
 * analyses / scene resource picks / asset prompts) — there is no undo.
 */
export function purgeTrashItem(
  userId: string,
  isAdmin: boolean,
  type: TrashItemType,
  id: string,
): TrashPurgeResult | null {
  if (!canActOn(userId, isAdmin, type, id)) return null;
  const db = getDb();
  const result = emptyResult();

  const run = db.transaction(() => {
    if (type === "project") {
      const categoryIds = (
        db
          .prepare(`SELECT id FROM categories WHERE project_id = ?`)
          .all(id) as { id: string }[]
      ).map((row) => row.id);
      for (const categoryId of categoryIds)
        purgeCategoryRows(db, categoryId, result);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
      result.projects += 1;
    } else if (type === "category") {
      purgeCategoryRows(db, id, result);
    } else {
      purgeVideoRows(db, id, result);
    }
  });
  run();

  return result;
}
