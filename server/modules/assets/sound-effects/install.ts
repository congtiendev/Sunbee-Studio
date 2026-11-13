import { readFile } from "node:fs/promises";
import type { LibraryAsset, SoundEffectPack } from "../../../../shared/types.js";
import { saveFile } from "../../../services/storage/files.js";
import { countAssetsBySourcePack, createLibraryAsset, findAssetIdBySourcePack, getLibraryAsset } from "../repo.js";
import { fetchKenneyPackSounds, listKenneyPacks } from "./kenney-source.js";
import { listSfxKitCategories, listSfxKitSounds, sfxKitDownloadUrl } from "./sfx-kit-catalog.js";
import { findSystemSound, systemSoundPath } from "./system-catalog.js";

/**
 * Combines every sound-effect source into one catalog: SFX Kit's 28
 * categories (CC0, metadata embedded locally — see sfx-kit-catalog.ts) and
 * Kenney.nl's audio packs (CC0, listed live — see kenney-source.ts). A
 * "pack" id is prefixed by source (`sfxkit:<category>` / `kenney:<slug>`) so
 * install can dispatch without a lookup table.
 */

const SYSTEM_PREFIX = "system:";
const SFXKIT_PREFIX = "sfxkit:";
const KENNEY_PREFIX = "kenney:";

// Kenney's pack list rarely changes; avoid hitting kenney.nl on every page load.
const KENNEY_CACHE_MS = 30 * 60_000;
let kenneyCache: { packs: { slug: string }[]; at: number } | null = null;

async function cachedKenneyPacks(): Promise<{ slug: string }[]> {
  if (kenneyCache && Date.now() - kenneyCache.at < KENNEY_CACHE_MS) return kenneyCache.packs;
  const packs = await listKenneyPacks();
  kenneyCache = { packs, at: Date.now() };
  return packs;
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function listSoundPacks(userId: string): Promise<SoundEffectPack[]> {
  const sfxKitPacks: SoundEffectPack[] = listSfxKitCategories().map((category) => ({
    id: `${SFXKIT_PREFIX}${category.id}`,
    title: category.title,
    description: category.description,
    soundCount: category.count,
    source: "SFX Kit (Wyzowl)",
    license: "CC0-1.0",
    installed: countAssetsBySourcePack(userId, `${SFXKIT_PREFIX}${category.id}`) > 0,
  }));

  let kenneyPacks: SoundEffectPack[];
  try {
    const packs = await cachedKenneyPacks();
    kenneyPacks = packs.map(({ slug }) => ({
      id: `${KENNEY_PREFIX}${slug}`,
      title: titleCase(slug),
      // Unlike SFX Kit's embedded catalog, a Kenney pack's sound count is
      // only known once it's actually downloaded and unzipped.
      soundCount: 0,
      source: "Kenney.nl",
      license: "CC0-1.0",
      installed: countAssetsBySourcePack(userId, `${KENNEY_PREFIX}${slug}`) > 0,
    }));
  } catch {
    // kenney.nl unreachable — still show the SFX Kit packs rather than fail the whole page.
    kenneyPacks = [];
  }

  return [...sfxKitPacks, ...kenneyPacks];
}

async function installSfxKitPack(userId: string, packId: string, categoryId: string): Promise<LibraryAsset[]> {
  const sounds = listSfxKitSounds(categoryId);
  if (sounds.length === 0) throw new Error("Không tìm thấy danh mục này trong SFX Kit.");
  const assets: LibraryAsset[] = [];
  for (const sound of sounds) {
    const res = await fetch(sfxKitDownloadUrl(sound));
    if (!res.ok) throw new Error(`Không tải được "${sound.name}" (HTTP ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const stored = await saveFile(userId, "asset", buffer, `${sound.id}.wav`, "audio/wav");
    const id = createLibraryAsset(userId, {
      fileId: stored.id,
      mediaType: "audio",
      name: sound.name,
      tags: sound.tags,
      description: sound.description,
      category: categoryId,
      sourcePackId: packId,
    });
    const asset = getLibraryAsset(userId, false, id);
    if (asset) assets.push(asset);
  }
  return assets;
}

const EXT_MIME: Record<string, string> = { wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg" };

async function installKenneyPack(userId: string, packId: string, slug: string): Promise<LibraryAsset[]> {
  const files = await fetchKenneyPackSounds(slug);
  if (files.length === 0) throw new Error(`Gói Kenney "${slug}" không có file âm thanh nào.`);
  const assets: LibraryAsset[] = [];
  for (const file of files) {
    const name = file.path.split("/").pop()!;
    const ext = name.split(".").pop()!.toLowerCase();
    const stored = await saveFile(userId, "asset", file.buffer, name, EXT_MIME[ext] ?? "application/octet-stream");
    const id = createLibraryAsset(userId, {
      fileId: stored.id,
      mediaType: "audio",
      name: name.replace(/\.[^.]+$/, ""),
      tags: [slug],
      description: "",
      category: slug,
      sourcePackId: packId,
    });
    const asset = getLibraryAsset(userId, false, id);
    if (asset) assets.push(asset);
  }
  return assets;
}

/** Installs a pack's every sound as a library asset; a second call for the same pack is a no-op. */
export async function installSoundPack(userId: string, packId: string): Promise<LibraryAsset[]> {
  if (countAssetsBySourcePack(userId, packId) > 0) {
    return []; // already installed — caller should re-fetch the library listing, not this pack again
  }
  if (packId.startsWith(SFXKIT_PREFIX)) {
    return installSfxKitPack(userId, packId, packId.slice(SFXKIT_PREFIX.length));
  }
  if (packId.startsWith(KENNEY_PREFIX)) {
    return installKenneyPack(userId, packId, packId.slice(KENNEY_PREFIX.length));
  }
  throw new Error("Không nhận ra gói âm thanh này.");
}

/**
 * Saves one system-library sound into the user's library (`sourcePackId` =
 * `system:<sound id>`, category = its readable title). Saving it again
 * returns the existing asset instead of a copy.
 */
export async function saveSystemSound(userId: string, soundId: string): Promise<LibraryAsset> {
  const sound = findSystemSound(soundId);
  if (!sound) throw new Error("Không tìm thấy âm thanh này trong thư viện hệ thống.");
  const sourceId = `${SYSTEM_PREFIX}${sound.id}`;
  const existingId = findAssetIdBySourcePack(userId, sourceId);
  const existing = existingId ? getLibraryAsset(userId, false, existingId) : null;
  if (existing) return existing;

  const buffer = await readFile(systemSoundPath(sound));
  const stored = await saveFile(userId, "asset", buffer, sound.file.split("/").pop()!, sound.mime);
  const id = createLibraryAsset(userId, {
    fileId: stored.id,
    mediaType: "audio",
    name: sound.name,
    tags: sound.tags,
    description: "",
    category: sound.categoryTitle,
    sourcePackId: sourceId,
  });
  const asset = getLibraryAsset(userId, false, id);
  if (!asset) throw new Error("Không lưu được âm thanh.");
  return asset;
}
