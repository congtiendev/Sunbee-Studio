import { getDb } from "./db/client.js";
import { listProjects, createProject } from "./db/projects-repo.js";
import { createCategory } from "./db/categories-repo.js";
import { createVideo } from "./db/videos-repo.js";
import { listScriptAnalyses, saveScriptVersion } from "../modules/script/repo.js";
import { listTemplates, saveTemplate } from "./db/style-templates-repo.js";
import { addAnthropicKey, getSettings, setSettings } from "../settings-store.js";
import type {
  Category,
  DataExportBundle,
  DataImportResult,
  Video,
} from "../../shared/types.js";

interface CategoryRow {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface VideoRow {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function listAllCategoriesForUser(userId: string): Category[] {
  const rows = getDb()
    .prepare(
      `SELECT id, project_id, name, created_at, updated_at
       FROM categories WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .all(userId) as CategoryRow[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function listAllVideosForUser(userId: string): Video[] {
  const rows = getDb()
    .prepare(
      `SELECT id, category_id, name, created_at, updated_at
       FROM videos WHERE user_id = ?`,
    )
    .all(userId) as VideoRow[];
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function buildExport(userId: string): DataExportBundle {
  const settings = getSettings(userId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: listProjects(userId, false),
    categories: listAllCategoriesForUser(userId),
    videos: listAllVideosForUser(userId),
    scriptAnalyses: listScriptAnalyses(userId, false),
    styleTemplates: listTemplates(userId, false),
    settings: {
      openaiApiKey: settings.openaiApiKey,
      anthropicApiKeys: settings.anthropicApiKeys,
      mcpEnabled: settings.mcpEnabled,
    },
  };
}

/**
 * Re-creates the bundle's rows as brand-new records owned by `userId`.
 * IDs are never reused — every project/category/video/script analysis gets
 * a fresh ID and relationships are remapped through the ones generated here,
 * so importing into an account that already has data never collides.
 */
export function importBundle(
  userId: string,
  bundle: DataExportBundle,
): DataImportResult {
  const projectIdMap = new Map<string, string>();
  for (const project of bundle.projects) {
    projectIdMap.set(project.id, createProject(userId, project.name).id);
  }

  const categoryIdMap = new Map<string, string>();
  for (const category of bundle.categories) {
    const newProjectId = projectIdMap.get(category.projectId);
    if (!newProjectId) continue; // Orphaned reference — skip rather than guess.
    categoryIdMap.set(
      category.id,
      createCategory(userId, newProjectId, category.name).id,
    );
  }

  const videoIdMap = new Map<string, string>();
  for (const video of bundle.videos) {
    const newCategoryId = categoryIdMap.get(video.categoryId);
    if (!newCategoryId) continue;
    videoIdMap.set(video.id, createVideo(userId, newCategoryId, video.name).id);
  }

  for (const record of bundle.scriptAnalyses) {
    const newVideoId = record.videoId ? videoIdMap.get(record.videoId) : undefined;
    saveScriptVersion(
      userId,
      record.sourceType,
      record.sourceUrl,
      record.scriptText,
      record.frames,
      record.kind,
      { scenes: record.scenes, resources: record.resources, style: record.style! },
      newVideoId,
    );
  }

  for (const template of bundle.styleTemplates) {
    saveTemplate(userId, {
      name: template.name,
      genre: template.genre,
      styleTags: template.styleTags,
      pacing: template.pacing,
      toneDescription: template.toneDescription,
      resourceInventory: template.resourceInventory,
    });
  }

  if (bundle.settings.openaiApiKey) {
    setSettings(userId, { openaiApiKey: bundle.settings.openaiApiKey });
  }
  if (bundle.settings.mcpEnabled !== undefined) {
    setSettings(userId, { mcpEnabled: bundle.settings.mcpEnabled });
  }
  for (const key of bundle.settings.anthropicApiKeys ?? []) {
    addAnthropicKey(userId, key.name, key.apiKey);
  }

  return {
    projects: projectIdMap.size,
    categories: categoryIdMap.size,
    videos: videoIdMap.size,
    scriptAnalyses: bundle.scriptAnalyses.length,
    styleTemplates: bundle.styleTemplates.length,
    anthropicKeys: bundle.settings.anthropicApiKeys?.length ?? 0,
    openaiKeyImported: Boolean(bundle.settings.openaiApiKey),
  };
}
