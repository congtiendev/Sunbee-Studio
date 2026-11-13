import JSZip from "jszip";

/**
 * Kenney.nl's audio packs (kenney.nl, CC0-1.0, no credit required — see
 * https://kenney.nl/about). There's no official API, so this scrapes the
 * two bits the site doesn't expose any other way: the list of audio packs,
 * and each pack's own direct .zip URL (plain HTML, both easily audited by
 * re-reading this file — the site returns 403 to requests with no User-Agent
 * at all, hence the honest, self-identifying one below).
 */
const UA = "SunbeeStudio-SoundEffects/1.0 (+https://github.com/)";
const CATEGORY_URL = "https://kenney.nl/assets/category:Audio";
const PACK_URL = (slug: string) => `https://kenney.nl/assets/${slug}`;
const ZIP_URL_RE = /https:\/\/kenney\.nl\/media\/[^"']+\.zip/;
const PACK_SLUG_RE = /kenney\.nl\/assets\/([a-z0-9-]+)['"]/g;
const AUDIO_EXT_RE = /\.(wav|ogg|mp3)$/i;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Kenney trả lỗi HTTP ${res.status} (${url}).`);
  return res.text();
}

export interface KenneyPack {
  /** The URL slug, e.g. "digital-audio" — also the pack's catalog id. */
  slug: string;
}

/** Every audio pack slug kenney.nl lists under its Audio category. */
export async function listKenneyPacks(): Promise<KenneyPack[]> {
  const html = await fetchText(CATEGORY_URL);
  const slugs = new Set<string>();
  for (const match of html.matchAll(PACK_SLUG_RE)) slugs.add(match[1]!);
  return [...slugs].sort().map((slug) => ({ slug }));
}

export interface KenneySoundFile {
  /** Path inside the zip, e.g. "laserLarge_000.ogg". */
  path: string;
  buffer: Buffer;
}

/** Downloads and unzips one pack; returns every audio file inside it. */
export async function fetchKenneyPackSounds(slug: string): Promise<KenneySoundFile[]> {
  const pageHtml = await fetchText(PACK_URL(slug));
  const zipUrl = ZIP_URL_RE.exec(pageHtml)?.[0];
  if (!zipUrl) throw new Error(`Không tìm thấy link tải cho gói Kenney "${slug}".`);

  const zipRes = await fetch(zipUrl, { headers: { "User-Agent": UA } });
  if (!zipRes.ok) throw new Error(`Không tải được gói Kenney "${slug}" (HTTP ${zipRes.status}).`);
  const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));

  const files: KenneySoundFile[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !AUDIO_EXT_RE.test(path)) continue;
    files.push({ path, buffer: await entry.async("nodebuffer") });
  }
  return files;
}
