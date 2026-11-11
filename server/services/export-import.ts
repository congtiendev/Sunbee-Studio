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
      `SELECT c.id, c.project_id, c.name, c.created_at, c.updated_at
       FROM categories c
       JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
       WHERE c.user_id = ? AND c.deleted_at IS NULL`,
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
      `SELECT v.id, v.category_id, v.name, v.created_at, v.updated_at
       FROM videos v
       JOIN categories c ON c.id = v.category_id AND c.deleted_at IS NULL
       JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL
       WHERE v.user_id = ? AND v.deleted_at IS NULL`,
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

/** Name of the project (and category) that takes in records whose parent isn't in the bundle. */
export const RECOVERED_PROJECT_NAME = "Khôi phục từ sao lưu";

/** Puts back a record's original timestamps (the repos stamp "now" on insert). */
function restoreTimestamps(
  table: "projects" | "categories" | "videos" | "style_templates",
  id: string,
  createdAt: string | undefined,
  updatedAt: string | undefined,
): void {
  if (!createdAt && !updatedAt) return;
  getDb()
    .prepare(
      `UPDATE ${table} SET created_at = COALESCE(?, created_at), updated_at = COALESCE(?, updated_at) WHERE id = ?`,
    )
    .run(createdAt ?? null, updatedAt ?? createdAt ?? null, id);
}

/**
 * Re-creates the bundle's rows as brand-new records owned by `userId`, keeping
 * every field and the original timestamps. IDs are never reused — every
 * project/category/video/skill/script version gets a fresh ID and relationships
 * (video, skills used, template source) are remapped through the ones generated
 * here, so importing into an account that already has data never collides.
 * Categories and videos whose parent isn't in the bundle go into a recovery
 * project instead of being dropped; API keys already in the account aren't added twice.
 */
export function importBundle(
  userId: string,
  bundle: DataExportBundle,
): DataImportResult {
  const db = getDb();
  return db.transaction((): DataImportResult => {
    const projectIdMap = new Map<string, string>();
    for (const project of bundle.projects) {
      const id = createProject(userId, project.name).id;
      restoreTimestamps("projects", id, project.createdAt, project.updatedAt);
      projectIdMap.set(project.id, id);
    }

    // Categories (and videos) whose parent isn't in the bundle — it was deleted
    // where the backup was made — go into one recovery project instead of being dropped.
    let recoveredProjectId: string | undefined;
    const recoveryProject = (createdAt?: string) => {
      if (!recoveredProjectId) {
        recoveredProjectId = createProject(userId, RECOVERED_PROJECT_NAME).id;
        restoreTimestamps("projects", recoveredProjectId, createdAt, createdAt);
      }
      return recoveredProjectId;
    };
    let recoveredCategoryId: string | undefined;
    const recoveryCategory = (createdAt?: string) => {
      if (!recoveredCategoryId) {
        recoveredCategoryId = createCategory(
          userId,
          recoveryProject(createdAt),
          RECOVERED_PROJECT_NAME,
        ).id;
        restoreTimestamps("categories", recoveredCategoryId, createdAt, createdAt);
      }
      return recoveredCategoryId;
    };

    let recoveredCategories = 0;
    let recoveredVideos = 0;
    const categoryIdMap = new Map<string, string>();
    for (const category of bundle.categories) {
      let projectId = projectIdMap.get(category.projectId);
      if (!projectId) {
        projectId = recoveryProject(category.createdAt);
        recoveredCategories++;
      }
      const id = createCategory(userId, projectId, category.name).id;
      restoreTimestamps("categories", id, category.createdAt, category.updatedAt);
      categoryIdMap.set(category.id, id);
    }

    const videoIdMap = new Map<string, string>();
    for (const video of bundle.videos) {
      let categoryId = categoryIdMap.get(video.categoryId);
      if (!categoryId) {
        categoryId = recoveryCategory(video.createdAt);
        recoveredVideos++;
      }
      videoIdMap.set(video.id, createVideo(userId, categoryId, video.name).id);
    }

    // Skills before script versions, which record the skills they used.
    const skillIdMap = new Map<string, string>();
    let missingReferenceImages = 0;
    for (const template of bundle.styleTemplates) {
      const id = saveTemplate(userId, {
        name: template.name,
        // Older backups predate these fields.
        type: template.type ?? "script",
        genre: template.genre,
        styleTags: template.styleTags,
        pacing: template.pacing,
        toneDescription: template.toneDescription,
        resourceInventory: template.resourceInventory,
        description: template.description,
        instructions: template.instructions,
        graphicsStyle: template.graphicsStyle,
        editingStyle: template.editingStyle,
        origin: template.origin,
        skillMd: template.skillMd,
      }).id;
      restoreTimestamps("style_templates", id, template.createdAt, template.updatedAt);
      skillIdMap.set(template.id, id);
      // The image files themselves aren't part of a backup.
      missingReferenceImages += template.referenceImageFileIds?.length ?? 0;
    }

    const setCreatedAt = db.prepare("UPDATE script_analyses SET created_at = ? WHERE id = ?");
    const scriptIdMap = new Map<string, string>();
    const templateSources: { id: string; sourceId: string }[] = [];
    for (const record of bundle.scriptAnalyses) {
      const saved = saveScriptVersion(
        userId,
        record.sourceType,
        record.sourceUrl,
        record.scriptText ?? "",
        record.frames ?? [],
        record.kind,
        { scenes: record.scenes, resources: record.resources, style: record.style! },
        record.videoId ? videoIdMap.get(record.videoId) : undefined,
        {
          approved: record.approved,
          characterRoster: record.characterRoster,
          objectRoster: record.objectRoster,
          styleTemplateId: record.styleTemplateId
            ? skillIdMap.get(record.styleTemplateId)
            : undefined,
          editingStyleTemplateId: record.editingStyleTemplateId
            ? skillIdMap.get(record.editingStyleTemplateId)
            : undefined,
          provider: record.provider,
          model: record.model,
          language: record.language,
        },
      );
      if (record.createdAt) setCreatedAt.run(record.createdAt, saved.id);
      scriptIdMap.set(record.id, saved.id);
      if (record.templateSourceId) {
        templateSources.push({ id: saved.id, sourceId: record.templateSourceId });
      }
    }
    // A template source may come later in the bundle than the version built on it.
    const setTemplateSource = db.prepare(
      "UPDATE script_analyses SET template_source_id = ? WHERE id = ?",
    );
    for (const link of templateSources) {
      const sourceId = scriptIdMap.get(link.sourceId);
      if (sourceId) setTemplateSource.run(sourceId, link.id);
    }

    // Saving script versions touches their videos; put the original times back last.
    for (const video of bundle.videos) {
      const id = videoIdMap.get(video.id);
      if (id) restoreTimestamps("videos", id, video.createdAt, video.updatedAt);
    }

    if (bundle.settings.openaiApiKey) {
      setSettings(userId, { openaiApiKey: bundle.settings.openaiApiKey });
    }
    if (bundle.settings.mcpEnabled !== undefined) {
      setSettings(userId, { mcpEnabled: bundle.settings.mcpEnabled });
    }
    const knownKeys = new Set(
      (getSettings(userId).anthropicApiKeys ?? []).map((key) => key.apiKey),
    );
    let anthropicKeys = 0;
    for (const key of bundle.settings.anthropicApiKeys ?? []) {
      if (knownKeys.has(key.apiKey)) continue;
      addAnthropicKey(userId, key.name, key.apiKey);
      knownKeys.add(key.apiKey);
      anthropicKeys++;
    }

    return {
      projects: projectIdMap.size + (recoveredProjectId ? 1 : 0),
      categories: categoryIdMap.size + (recoveredCategoryId ? 1 : 0),
      videos: videoIdMap.size,
      scriptAnalyses: scriptIdMap.size,
      styleTemplates: skillIdMap.size,
      anthropicKeys,
      openaiKeyImported: Boolean(bundle.settings.openaiApiKey),
      recoveredCategories,
      recoveredVideos,
      missingReferenceImages,
    };
  })();
}
