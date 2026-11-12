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

type ImportKind = "project" | "category" | "video" | "styleTemplate" | "scriptAnalysis";

/** The record a bundle item's ORIGINAL id was already imported as, if this exact backup (or an overlapping one) was imported before. */
function alreadyImported(userId: string, kind: ImportKind, originalId: string): string | undefined {
  const row = getDb()
    .prepare(
      `SELECT record_id FROM import_records WHERE user_id = ? AND kind = ? AND original_id = ?`,
    )
    .get(userId, kind, originalId) as { record_id: string } | undefined;
  return row?.record_id;
}

function recordImported(
  userId: string,
  kind: ImportKind,
  originalId: string,
  recordId: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO import_records (user_id, kind, original_id, record_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, kind, originalId, recordId, new Date().toISOString());
}

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
 * every field and the original timestamps. A record whose ORIGINAL id (from
 * the account it was exported from) was already imported in an earlier run is
 * skipped and its existing id reused instead — so importing the same backup
 * twice, or a newer backup that overlaps an older one, never duplicates data.
 * A genuinely new id always gets a fresh row: importing into an account that
 * already has its own, unrelated data never collides. Categories and videos
 * whose parent isn't in the bundle go into a recovery project instead of
 * being dropped; API keys already in the account aren't added twice.
 */
export function importBundle(
  userId: string,
  bundle: DataExportBundle,
): DataImportResult {
  const db = getDb();
  return db.transaction((): DataImportResult => {
    let skippedDuplicates = 0;
    let newProjects = 0;

    const projectIdMap = new Map<string, string>();
    for (const project of bundle.projects) {
      const existing = alreadyImported(userId, "project", project.id);
      if (existing) {
        projectIdMap.set(project.id, existing);
        skippedDuplicates++;
        continue;
      }
      const id = createProject(userId, project.name).id;
      restoreTimestamps("projects", id, project.createdAt, project.updatedAt);
      projectIdMap.set(project.id, id);
      recordImported(userId, "project", project.id, id);
      newProjects++;
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
    let newCategories = 0;
    const categoryIdMap = new Map<string, string>();
    for (const category of bundle.categories) {
      const existing = alreadyImported(userId, "category", category.id);
      if (existing) {
        categoryIdMap.set(category.id, existing);
        skippedDuplicates++;
        continue;
      }
      let projectId = projectIdMap.get(category.projectId);
      if (!projectId) {
        projectId = recoveryProject(category.createdAt);
        recoveredCategories++;
      }
      const id = createCategory(userId, projectId, category.name).id;
      restoreTimestamps("categories", id, category.createdAt, category.updatedAt);
      categoryIdMap.set(category.id, id);
      recordImported(userId, "category", category.id, id);
      newCategories++;
    }

    let newVideos = 0;
    const videoIdMap = new Map<string, string>();
    const newVideoOriginalIds = new Set<string>();
    for (const video of bundle.videos) {
      const existing = alreadyImported(userId, "video", video.id);
      if (existing) {
        videoIdMap.set(video.id, existing);
        skippedDuplicates++;
        continue;
      }
      let categoryId = categoryIdMap.get(video.categoryId);
      if (!categoryId) {
        categoryId = recoveryCategory(video.createdAt);
        recoveredVideos++;
      }
      const id = createVideo(userId, categoryId, video.name).id;
      videoIdMap.set(video.id, id);
      newVideoOriginalIds.add(video.id);
      recordImported(userId, "video", video.id, id);
      newVideos++;
    }

    // Skills before script versions, which record the skills they used.
    const skillIdMap = new Map<string, string>();
    let missingReferenceImages = 0;
    let newStyleTemplates = 0;
    for (const template of bundle.styleTemplates) {
      const existing = alreadyImported(userId, "styleTemplate", template.id);
      if (existing) {
        skillIdMap.set(template.id, existing);
        skippedDuplicates++;
        continue;
      }
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
      recordImported(userId, "styleTemplate", template.id, id);
      newStyleTemplates++;
      // The image files themselves aren't part of a backup.
      missingReferenceImages += template.referenceImageFileIds?.length ?? 0;
    }

    const setCreatedAt = db.prepare("UPDATE script_analyses SET created_at = ? WHERE id = ?");
    const scriptIdMap = new Map<string, string>();
    const templateSources: { id: string; sourceId: string }[] = [];
    let newScriptAnalyses = 0;
    for (const record of bundle.scriptAnalyses) {
      const existing = alreadyImported(userId, "scriptAnalysis", record.id);
      if (existing) {
        scriptIdMap.set(record.id, existing);
        skippedDuplicates++;
        continue;
      }
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
      recordImported(userId, "scriptAnalysis", record.id, saved.id);
      newScriptAnalyses++;
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

    // Saving script versions touches their videos; put the original times back last
    // (only for videos this run actually created — a skipped one is untouched).
    for (const video of bundle.videos) {
      const id = newVideoOriginalIds.has(video.id) ? videoIdMap.get(video.id) : undefined;
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
      projects: newProjects + (recoveredProjectId ? 1 : 0),
      categories: newCategories + (recoveredCategoryId ? 1 : 0),
      videos: newVideos,
      scriptAnalyses: newScriptAnalyses,
      styleTemplates: newStyleTemplates,
      anthropicKeys,
      openaiKeyImported: Boolean(bundle.settings.openaiApiKey),
      recoveredCategories,
      recoveredVideos,
      missingReferenceImages,
      skippedDuplicates,
    };
  })();
}
