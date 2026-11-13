import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { SystemSound, SystemSoundCategory, SystemSoundLibrary } from "../../../../shared/types.js";
import { dataDir } from "../../../env.js";

/**
 * Sunbee's own system sound library: sound files that live on this machine
 * under `<dataDir>/system-sounds/<category>/`, described by
 * `<dataDir>/system-sounds/catalog.json` (written when the library is
 * imported — the files are too large to ship in the repo). Users browse and
 * preview it directly, and save single sounds into their own library.
 * No catalog file means an empty library — never an error.
 */

/** A catalog entry as stored on disk — `file`/`mime` stay server-side. */
interface CatalogSound extends SystemSound {
  /** Path relative to the system-sounds folder, e.g. `whoosh/deep-woosh.mp3`. */
  file: string;
  mime: string;
}

interface Catalog {
  license: string;
  categories: SystemSoundCategory[];
  sounds: CatalogSound[];
}

function rootDir(): string {
  return join(dataDir(), "system-sounds");
}

let cached: { catalog: Catalog; mtimeMs: number } | null = null;

function load(): Catalog | null {
  const path = join(rootDir(), "catalog.json");
  if (!existsSync(path)) return null;
  // Re-read when the catalog is re-imported while the server runs.
  const { mtimeMs } = statSync(path);
  if (cached?.mtimeMs !== mtimeMs) {
    cached = { catalog: JSON.parse(readFileSync(path, "utf-8")) as Catalog, mtimeMs };
  }
  return cached.catalog;
}

export function getSystemSoundLibrary(): SystemSoundLibrary {
  const catalog = load();
  if (!catalog) return { license: "", categories: [], sounds: [] };
  // List sounds in the categories' own order (whooshes first, music last), then by name.
  const order = new Map(catalog.categories.map((c, index) => [c.id, index]));
  const sounds = catalog.sounds
    .map(({ id, name, category, duration, tags }) => ({ id, name, category, duration, tags }))
    .sort(
      (a, b) =>
        (order.get(a.category) ?? Infinity) - (order.get(b.category) ?? Infinity) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
  return { license: catalog.license, categories: catalog.categories, sounds };
}

export function findSystemSound(id: string): (CatalogSound & { categoryTitle: string }) | null {
  const catalog = load();
  const sound = catalog?.sounds.find((s) => s.id === id);
  if (!catalog || !sound) return null;
  const categoryTitle = catalog.categories.find((c) => c.id === sound.category)?.title ?? sound.category;
  return { ...sound, categoryTitle };
}

/** Absolute path of a catalog sound's file, refusing anything that escapes the system-sounds folder. */
export function systemSoundPath(sound: CatalogSound): string {
  const root = resolve(rootDir());
  const path = resolve(root, sound.file);
  if (!path.startsWith(root + sep)) throw new Error(`Đường dẫn âm thanh không hợp lệ: ${sound.file}`);
  return path;
}
