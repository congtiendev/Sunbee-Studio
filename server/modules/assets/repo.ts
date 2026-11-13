import { randomUUID } from "node:crypto";
import { isFrameRatio } from "../../../shared/frame-ratio.js";
import type {
  AssetCandidate,
  AssetPromptRecord,
  FrameRatio,
  ImageLayer,
  LibraryAsset,
  LibraryMediaType,
  SceneResource,
} from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";

// ---------- library ----------

interface AssetRow {
  id: string;
  user_id: string;
  file_id: string;
  media_type: LibraryMediaType;
  name: string;
  category: string | null;
  source_pack_id: string | null;
  tags_json: string;
  description: string;
  created_at: string;
  mime: string;
  size: number;
  owner_email: string | null;
}

function rowToAsset(row: AssetRow): LibraryAsset {
  return {
    id: row.id,
    fileId: row.file_id,
    mediaType: row.media_type,
    name: row.name,
    category: row.category ?? undefined,
    tags: JSON.parse(row.tags_json) as string[],
    description: row.description,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
    ownerEmail: row.owner_email ?? undefined,
    sourcePackId: row.source_pack_id ?? undefined,
  };
}

const ASSET_SELECT = `
  SELECT a.id, a.user_id, a.file_id, a.media_type, a.name, a.category, a.source_pack_id,
         a.tags_json, a.description, a.created_at, f.mime, f.size, u.email AS owner_email
  FROM assets a
  JOIN files f ON f.id = a.file_id
  LEFT JOIN users u ON u.id = a.user_id
`;

export function createLibraryAsset(
  userId: string,
  input: {
    fileId: string;
    mediaType: LibraryMediaType;
    name: string;
    tags: string[];
    description: string;
    category?: string;
    sourcePackId?: string;
  },
): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO assets (id, user_id, file_id, media_type, name, category, source_pack_id, tags_json, description, created_at)
       VALUES (@id, @user_id, @file_id, @media_type, @name, @category, @source_pack_id, @tags_json, @description, @created_at)`,
    )
    .run({
      id,
      user_id: userId,
      file_id: input.fileId,
      media_type: input.mediaType,
      name: input.name,
      category: input.category ?? null,
      source_pack_id: input.sourcePackId ?? null,
      tags_json: JSON.stringify(input.tags),
      description: input.description,
      created_at: new Date().toISOString(),
    });
  return id;
}

/** Whether `sourcePackId` was already installed for this user (install is idempotent). */
export function countAssetsBySourcePack(userId: string, sourcePackId: string): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND source_pack_id = ?")
      .get(userId, sourcePackId) as { n: number }
  ).n;
}

export function getLibraryAsset(userId: string, isAdmin: boolean, id: string): LibraryAsset | null {
  const row = getDb().prepare(`${ASSET_SELECT} WHERE a.id = ?`).get(id) as AssetRow | undefined;
  if (!row || (!isAdmin && row.user_id !== userId)) return null;
  return rowToAsset(row);
}

export function updateLibraryAsset(
  userId: string,
  isAdmin: boolean,
  id: string,
  patch: { name?: string; tags?: string[]; description?: string },
): LibraryAsset | null {
  const current = getLibraryAsset(userId, isAdmin, id);
  if (!current) return null;
  getDb()
    .prepare("UPDATE assets SET name = ?, tags_json = ?, description = ? WHERE id = ?")
    .run(
      patch.name ?? current.name,
      JSON.stringify(patch.tags ?? current.tags),
      patch.description ?? current.description,
      id,
    );
  return getLibraryAsset(userId, isAdmin, id);
}

/** Deletes the library entry; returns its file id so the caller can remove the file. */
export function deleteLibraryAsset(userId: string, isAdmin: boolean, id: string): string | null {
  const asset = getLibraryAsset(userId, isAdmin, id);
  if (!asset) return null;
  getDb().prepare("DELETE FROM assets WHERE id = ?").run(id);
  return asset.fileId;
}

/**
 * Library search. Every query word is matched against name, tags and
 * description; results are ranked by how many words matched. An empty
 * query lists everything (newest first).
 */
export function searchLibrary(
  userId: string,
  isAdmin: boolean,
  options: { query?: string; mediaType?: LibraryMediaType; category?: string; limit?: number } = {},
): LibraryAsset[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!isAdmin) {
    where.push("a.user_id = ?");
    params.push(userId);
  }
  if (options.mediaType) {
    where.push("a.media_type = ?");
    params.push(options.mediaType);
  }
  if (options.category) {
    where.push("a.category = ?");
    params.push(options.category);
  }
  const rows = getDb()
    .prepare(
      `${ASSET_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.created_at DESC`,
    )
    .all(...params) as AssetRow[];
  const assets = rows.map(rowToAsset);

  const words = (options.query ?? "")
    .toLowerCase()
    .split(/[\s,.;:!?()"'[\]]+/)
    .filter((word) => word.length >= 2);
  const limit = options.limit ?? 50;
  if (words.length === 0) return assets.slice(0, limit);

  return assets
    .map((asset) => {
      const haystack = `${asset.name} ${asset.tags.join(" ")} ${asset.description}`.toLowerCase();
      return { asset, score: words.filter((word) => haystack.includes(word)).length };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => hit.asset);
}

// ---------- AI-written image prompts per required asset ----------

/** The key a required asset's prompt is stored under — the same normalization the batch dialog dedupes on. */
export function assetPromptKey(description: string): string {
  return description.trim().toLowerCase();
}

/** Prompts saved for a video — always reused regardless of when they were written; a rewrite overwrites the same row in place. */
export function listAssetPrompts(videoId: string): AssetPromptRecord[] {
  return (
    getDb()
      .prepare(
        `SELECT description, prompt, frame_ratio, layer, updated_at FROM asset_prompts
         WHERE video_id = ? ORDER BY updated_at`,
      )
      .all(videoId) as {
        description: string;
        prompt: string;
        frame_ratio: string | null;
        layer: string | null;
        updated_at: string;
      }[]
  ).map((row) => ({
    description: row.description,
    prompt: row.prompt,
    frameRatio: isFrameRatio(row.frame_ratio) ? row.frame_ratio : undefined,
    layer: row.layer === "scene" || row.layer === "cutout" ? row.layer : undefined,
    updatedAt: row.updated_at,
  }));
}

export function saveAssetPrompt(
  userId: string,
  input: {
    videoId: string;
    description: string;
    prompt: string;
    frameRatio?: FrameRatio;
    layer?: ImageLayer;
  },
): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO asset_prompts (video_id, description_key, user_id, description, prompt, frame_ratio, layer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (video_id, description_key) DO UPDATE SET
         description = excluded.description,
         prompt = excluded.prompt,
         frame_ratio = excluded.frame_ratio,
         layer = excluded.layer,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.videoId,
      assetPromptKey(input.description),
      userId,
      input.description,
      input.prompt,
      input.frameRatio ?? null,
      input.layer ?? null,
      now,
      now,
    );
}

// ---------- scene resources (the pick for each required asset) ----------

interface SceneResourceRow {
  id: string;
  video_id: string;
  scene_index: number;
  asset_index: number;
  asset_description: string;
  candidate_json: string;
  created_at: string;
}

function rowToSceneResource(row: SceneResourceRow): SceneResource {
  return {
    id: row.id,
    videoId: row.video_id,
    sceneIndex: row.scene_index,
    assetIndex: row.asset_index,
    assetDescription: row.asset_description,
    candidate: JSON.parse(row.candidate_json) as AssetCandidate,
    createdAt: row.created_at,
  };
}

export function listSceneResources(videoId: string): SceneResource[] {
  return (
    getDb()
      .prepare(
        `SELECT id, video_id, scene_index, asset_index, asset_description, candidate_json, created_at
         FROM scene_resources WHERE video_id = ? ORDER BY scene_index, asset_index`,
      )
      .all(videoId) as SceneResourceRow[]
  ).map(rowToSceneResource);
}

/** Drops every pick of the given scenes — after their asset lists were rewritten, the old positions mean other assets. */
export function clearSceneResources(videoId: string, sceneIndexes: number[]): void {
  const remove = getDb().prepare("DELETE FROM scene_resources WHERE video_id = ? AND scene_index = ?");
  for (const index of sceneIndexes) remove.run(videoId, index);
}

/** Sets (or, with a null candidate, clears) the pick for one required asset. */
export function setSceneResource(
  userId: string,
  input: {
    videoId: string;
    sceneIndex: number;
    assetIndex: number;
    assetDescription: string;
    candidate: AssetCandidate | null;
  },
): SceneResource | null {
  const db = getDb();
  if (!input.candidate) {
    db.prepare(
      "DELETE FROM scene_resources WHERE video_id = ? AND scene_index = ? AND asset_index = ?",
    ).run(input.videoId, input.sceneIndex, input.assetIndex);
    return null;
  }
  const row: SceneResourceRow = {
    id: randomUUID(),
    video_id: input.videoId,
    scene_index: input.sceneIndex,
    asset_index: input.assetIndex,
    asset_description: input.assetDescription,
    candidate_json: JSON.stringify(input.candidate),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO scene_resources (id, user_id, video_id, scene_index, asset_index, asset_description, source_key, candidate_json, created_at)
     VALUES (@id, @userId, @video_id, @scene_index, @asset_index, @asset_description, @sourceKey, @candidate_json, @created_at)
     ON CONFLICT (video_id, scene_index, asset_index) DO UPDATE SET
       asset_description = excluded.asset_description,
       source_key = excluded.source_key,
       candidate_json = excluded.candidate_json,
       created_at = excluded.created_at`,
  ).run({ ...row, userId, sourceKey: input.candidate.sourceKey });
  return (
    listSceneResources(input.videoId).find(
      (r) => r.sceneIndex === input.sceneIndex && r.assetIndex === input.assetIndex,
    ) ?? null
  );
}
