import { randomUUID } from "node:crypto";
import type { StyleTemplate } from "../../../shared/types.js";
import { getDb } from "./client.js";

interface StyleTemplateRow {
  id: string;
  name: string;
  created_at: string;
  genre: string;
  style_tags_json: string;
  pacing_json: string;
  tone_description: string;
  resource_inventory_json: string;
  user_id: string | null;
  owner_email: string | null;
}

function rowToTemplate(row: StyleTemplateRow): StyleTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    genre: row.genre,
    styleTags: JSON.parse(row.style_tags_json),
    pacing: JSON.parse(row.pacing_json),
    toneDescription: row.tone_description,
    resourceInventory: JSON.parse(row.resource_inventory_json),
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

export function listTemplates(
  userId: string,
  isAdmin: boolean,
): StyleTemplate[] {
  const base = `
    SELECT st.id, st.name, st.created_at, st.genre, st.style_tags_json, st.pacing_json,
           st.tone_description, st.resource_inventory_json, st.user_id, u.email AS owner_email
    FROM style_templates st
    LEFT JOIN users u ON u.id = st.user_id
  `;
  const rows = isAdmin
    ? (getDb()
        .prepare(`${base} ORDER BY st.created_at DESC`)
        .all() as StyleTemplateRow[])
    : (getDb()
        .prepare(`${base} WHERE st.user_id = ? ORDER BY st.created_at DESC`)
        .all(userId) as StyleTemplateRow[]);

  return rows.map(rowToTemplate);
}

export function getTemplateById(
  userId: string,
  isAdmin: boolean,
  id: string,
): StyleTemplate | null {
  const base = `
    SELECT st.id, st.name, st.created_at, st.genre, st.style_tags_json, st.pacing_json,
           st.tone_description, st.resource_inventory_json, st.user_id, u.email AS owner_email
    FROM style_templates st
    LEFT JOIN users u ON u.id = st.user_id
    WHERE st.id = ?
  `;
  const row = isAdmin
    ? (getDb().prepare(base).get(id) as StyleTemplateRow | undefined)
    : (getDb()
        .prepare(`${base} AND st.user_id = ?`)
        .get(id, userId) as StyleTemplateRow | undefined);

  return row ? rowToTemplate(row) : null;
}

export function saveTemplate(
  userId: string,
  template: Omit<StyleTemplate, "id" | "createdAt" | "userId" | "ownerEmail">,
): StyleTemplate {
  const record = {
    ...template,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO style_templates (id, name, created_at, genre, style_tags_json, pacing_json, tone_description, resource_inventory_json, user_id)
       VALUES (@id, @name, @createdAt, @genre, @styleTagsJson, @pacingJson, @toneDescription, @resourceInventoryJson, @userId)`,
    )
    .run({
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      genre: record.genre,
      styleTagsJson: JSON.stringify(record.styleTags),
      pacingJson: JSON.stringify(record.pacing),
      toneDescription: record.toneDescription,
      resourceInventoryJson: JSON.stringify(record.resourceInventory),
      userId,
    });

  return { ...record, userId };
}

export function deleteTemplate(
  userId: string,
  isAdmin: boolean,
  id: string,
): void {
  if (isAdmin) {
    getDb().prepare(`DELETE FROM style_templates WHERE id = ?`).run(id);
  } else {
    getDb()
      .prepare(`DELETE FROM style_templates WHERE id = ? AND user_id = ?`)
      .run(id, userId);
  }
}
