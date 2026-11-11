import { randomUUID } from "node:crypto";
import type { SkillInput, SkillOrigin, SkillType, StyleTemplate } from "../../../shared/types.js";
import { getDb } from "./client.js";

/**
 * Skills. Stored in the `style_templates` table for backward compatibility
 * (MCP tools, old backups); the UI calls them "skills".
 */
interface StyleTemplateRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  type: SkillType;
  genre: string;
  style_tags_json: string;
  pacing_json: string;
  tone_description: string;
  resource_inventory_json: string;
  description: string;
  instructions: string;
  graphics_style: string | null;
  editing_style: string | null;
  reference_image_files_json: string | null;
  origin: SkillOrigin;
  skill_md: string | null;
  user_id: string | null;
  owner_email: string | null;
}

function rowToTemplate(row: StyleTemplateRow): StyleTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    type: row.type,
    genre: row.genre,
    styleTags: JSON.parse(row.style_tags_json),
    pacing: JSON.parse(row.pacing_json),
    toneDescription: row.tone_description,
    resourceInventory: JSON.parse(row.resource_inventory_json),
    description: row.description,
    instructions: row.instructions,
    graphicsStyle: row.graphics_style ?? undefined,
    editingStyle: row.editing_style ?? undefined,
    referenceImageFileIds: row.reference_image_files_json ? JSON.parse(row.reference_image_files_json) : [],
    origin: row.origin,
    skillMd: row.skill_md ?? undefined,
    userId: row.user_id ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
  };
}

const SELECT_BASE = `
  SELECT st.id, st.name, st.created_at, st.updated_at, st.type, st.genre, st.style_tags_json,
         st.pacing_json, st.tone_description, st.resource_inventory_json, st.description,
         st.instructions, st.graphics_style, st.editing_style, st.reference_image_files_json, st.origin, st.skill_md,
         st.user_id, u.email AS owner_email
  FROM style_templates st
  LEFT JOIN users u ON u.id = st.user_id
`;

export function listTemplates(userId: string, isAdmin: boolean): StyleTemplate[] {
  const rows = isAdmin
    ? (getDb().prepare(`${SELECT_BASE} ORDER BY st.created_at DESC`).all() as StyleTemplateRow[])
    : (getDb()
        .prepare(`${SELECT_BASE} WHERE st.user_id = ? ORDER BY st.created_at DESC`)
        .all(userId) as StyleTemplateRow[]);
  return rows.map(rowToTemplate);
}

export function getTemplateById(
  userId: string,
  isAdmin: boolean,
  id: string,
): StyleTemplate | null {
  const row = isAdmin
    ? (getDb().prepare(`${SELECT_BASE} WHERE st.id = ?`).get(id) as StyleTemplateRow | undefined)
    : (getDb()
        .prepare(`${SELECT_BASE} WHERE st.id = ? AND st.user_id = ?`)
        .get(id, userId) as StyleTemplateRow | undefined);
  return row ? rowToTemplate(row) : null;
}

export function saveTemplate(userId: string, template: SkillInput): StyleTemplate {
  const now = new Date().toISOString();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO style_templates (id, name, created_at, updated_at, type, genre, style_tags_json, pacing_json,
         tone_description, resource_inventory_json, description, instructions, graphics_style, editing_style,
         reference_image_files_json, origin, skill_md, user_id)
       VALUES (@id, @name, @now, @now, @type, @genre, @styleTagsJson, @pacingJson, @toneDescription,
         @resourceInventoryJson, @description, @instructions, @graphicsStyle, @editingStyle, NULL, @origin, @skillMd, @userId)`,
    )
    .run({
      id,
      now,
      name: template.name,
      type: template.type ?? "script",
      genre: template.genre,
      styleTagsJson: JSON.stringify(template.styleTags),
      pacingJson: JSON.stringify(template.pacing),
      toneDescription: template.toneDescription,
      resourceInventoryJson: JSON.stringify(template.resourceInventory ?? {}),
      description: template.description ?? "",
      instructions: template.instructions ?? "",
      graphicsStyle: template.graphicsStyle ?? null,
      editingStyle: template.editingStyle ?? null,
      origin: template.origin ?? "app",
      skillMd: template.skillMd ?? null,
      userId,
    });
  return getTemplateById(userId, false, id)!;
}

export function updateTemplate(
  userId: string,
  isAdmin: boolean,
  id: string,
  patch: Partial<SkillInput>,
): StyleTemplate | null {
  const current = getTemplateById(userId, isAdmin, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE style_templates SET name = @name, updated_at = @now, type = @type, genre = @genre,
         style_tags_json = @styleTagsJson, pacing_json = @pacingJson, tone_description = @toneDescription,
         resource_inventory_json = @resourceInventoryJson, description = @description,
         instructions = @instructions, graphics_style = @graphicsStyle, editing_style = @editingStyle,
         origin = @origin, skill_md = @skillMd
       WHERE id = @id`,
    )
    .run({
      id,
      now: new Date().toISOString(),
      name: next.name,
      type: next.type ?? "script",
      genre: next.genre,
      styleTagsJson: JSON.stringify(next.styleTags),
      pacingJson: JSON.stringify(next.pacing),
      toneDescription: next.toneDescription,
      resourceInventoryJson: JSON.stringify(next.resourceInventory ?? {}),
      description: next.description ?? "",
      instructions: next.instructions ?? "",
      graphicsStyle: next.graphicsStyle ?? null,
      editingStyle: next.editingStyle ?? null,
      origin: next.origin ?? "app",
      skillMd: next.skillMd ?? null,
    });
  return getTemplateById(userId, isAdmin, id);
}

/** Up to 10 reference images per skill. */
export const MAX_REFERENCE_IMAGES = 10;

function writeReferenceImages(id: string, fileIds: string[]): void {
  getDb()
    .prepare(`UPDATE style_templates SET reference_image_files_json = ? WHERE id = ?`)
    .run(JSON.stringify(fileIds), id);
}

/** Appends a reference image. Kept separate from `updateTemplate`'s field patch so the generic save/update flow never touches it by accident. */
export function addReferenceImage(
  userId: string,
  isAdmin: boolean,
  id: string,
  fileId: string,
): StyleTemplate | null {
  const current = getTemplateById(userId, isAdmin, id);
  if (!current) return null;
  if (current.referenceImageFileIds.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`Tối đa ${MAX_REFERENCE_IMAGES} ảnh minh hoạ mỗi skill.`);
  }
  writeReferenceImages(id, [...current.referenceImageFileIds, fileId]);
  return getTemplateById(userId, isAdmin, id);
}

/** Removes one reference image by its file id. */
export function removeReferenceImage(
  userId: string,
  isAdmin: boolean,
  id: string,
  fileId: string,
): StyleTemplate | null {
  const current = getTemplateById(userId, isAdmin, id);
  if (!current) return null;
  writeReferenceImages(
    id,
    current.referenceImageFileIds.filter((existing) => existing !== fileId),
  );
  return getTemplateById(userId, isAdmin, id);
}

export function deleteTemplate(userId: string, isAdmin: boolean, id: string): void {
  if (!getTemplateById(userId, isAdmin, id)) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM skill_examples WHERE skill_id = ?").run(id);
    db.prepare("DELETE FROM skill_versions WHERE skill_id = ?").run(id);
    db.prepare("DELETE FROM document_links WHERE target_type = 'skill' AND target_id = ?").run(id);
    db.prepare("DELETE FROM style_templates WHERE id = ?").run(id);
  })();
}

export function listSkillExampleIds(skillId: string): string[] {
  return (
    getDb()
      .prepare(
        "SELECT script_analysis_id FROM skill_examples WHERE skill_id = ? ORDER BY created_at",
      )
      .all(skillId) as { script_analysis_id: string }[]
  ).map((row) => row.script_analysis_id);
}

export function setSkillExamples(skillId: string, scriptAnalysisIds: string[]): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO skill_examples (skill_id, script_analysis_id, created_at) VALUES (?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM skill_examples WHERE skill_id = ?").run(skillId);
    // Distinct timestamps keep the chosen order stable.
    const base = Date.now();
    scriptAnalysisIds.forEach((analysisId, i) =>
      insert.run(skillId, analysisId, new Date(base + i).toISOString()),
    );
  })();
}
