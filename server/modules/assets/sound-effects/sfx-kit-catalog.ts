import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * SFX Kit by Wyzowl (github.com/wyzowl/sfx-kit) — 320 sound effects across
 * 28 categories, CC0-1.0, no credit required. Trimmed copy of their
 * `sounds.json` (dropped sync/timing/level fields we don't use) embedded
 * here; the actual audio files are NOT bundled — each is fetched from
 * GitHub's raw content CDN only when a category is installed.
 */
const CATALOG_PATH = fileURLToPath(new URL("./sfx-kit-sounds.json", import.meta.url));
const RAW_BASE = "https://raw.githubusercontent.com/wyzowl/sfx-kit/main";

export interface SfxKitCategory {
  id: string;
  title: string;
  description: string;
  count: number;
}

export interface SfxKitSound {
  id: string;
  name: string;
  category: string;
  file: string;
  description: string;
  tags: string[];
  duration: number;
}

interface SfxKitData {
  source: string;
  license: string;
  credit: string;
  categories: SfxKitCategory[];
  sounds: SfxKitSound[];
}

let cached: SfxKitData | null = null;

function load(): SfxKitData {
  cached ??= JSON.parse(readFileSync(CATALOG_PATH, "utf-8")) as SfxKitData;
  return cached;
}

export function listSfxKitCategories(): SfxKitCategory[] {
  return load().categories;
}

export function listSfxKitSounds(categoryId: string): SfxKitSound[] {
  return load().sounds.filter((sound) => sound.category === categoryId);
}

export function sfxKitDownloadUrl(sound: SfxKitSound): string {
  return `${RAW_BASE}/${sound.file}`;
}
