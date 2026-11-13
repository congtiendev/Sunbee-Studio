import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { VoiceProfile, VoicePreset } from "../../../shared/types.js";
import {
  createPresetVoiceProfile,
  createVoiceProfile,
  getVoiceProfileByPreset,
} from "../../modules/voiceover/repo.js";
import { saveFile } from "../storage/files.js";
import { createLocalVoiceEngine } from "./providers/local-engine.js";
import { VIENEU_PRESETS } from "./vieneu-presets.js";

/**
 * Catalog of ready-made voices the user can install with one click, from
 * two sources merged into one list:
 *  - VieNeu-TTS's 25 built-in voices (`vieneu-presets.ts`) — no download of
 *    our own; the whole model is fetched once by the `vieneu` package
 *    itself, so "installing" one just creates a `VoiceProfile` row.
 *  - A manifest the user fills in themselves (`./presets/README.md`) for
 *    their own sample-based cloning voices — empty by default.
 */
const PRESETS_DIR = fileURLToPath(new URL("./presets", import.meta.url));

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;

interface PresetManifestEntry {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "other";
  description?: string;
  samplePath?: string;
  sampleUrl?: string;
  mime: string;
}

async function loadManifest(): Promise<PresetManifestEntry[]> {
  try {
    const raw = await readFile(join(PRESETS_DIR, "manifest.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PresetManifestEntry[]) : [];
  } catch {
    // Missing/invalid manifest degrades to an empty catalog, never crashes the page.
    return [];
  }
}

export async function listPresets(userId: string): Promise<VoicePreset[]> {
  const manifest = await loadManifest();
  const manifestPresets: VoicePreset[] = manifest.map((entry) => ({
    id: entry.id,
    name: entry.name,
    language: entry.language,
    gender: entry.gender,
    description: entry.description,
    installed: getVoiceProfileByPreset(userId, entry.id) !== null,
  }));

  const vieneuPresets: VoicePreset[] = VIENEU_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    language: "vi",
    gender: "other",
    description: preset.editorsPick ? "Gợi ý — ổn định, tự nhiên" : undefined,
    license: "Apache-2.0",
    commercialOk: true,
    installed: getVoiceProfileByPreset(userId, preset.id) !== null,
  }));

  return [...vieneuPresets, ...manifestPresets];
}

async function resolveSampleBytes(entry: PresetManifestEntry): Promise<Buffer> {
  if (entry.samplePath) {
    return readFile(join(PRESETS_DIR, "samples", entry.samplePath));
  }
  if (entry.sampleUrl) {
    const res = await fetch(entry.sampleUrl);
    if (!res.ok) throw new Error(`Không tải được mẫu giọng (${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_SAMPLE_BYTES) {
      throw new Error(`Mẫu giọng quá lớn. Giới hạn ${MAX_SAMPLE_BYTES / 1024 / 1024}MB.`);
    }
    return buffer;
  }
  throw new Error("Preset này thiếu mẫu giọng (samplePath/sampleUrl).");
}

async function installManifestPreset(userId: string, entry: PresetManifestEntry): Promise<VoiceProfile> {
  const bytes = await resolveSampleBytes(entry);
  const stored = await saveFile(userId, "voice-sample", bytes, `${entry.id}.sample`, entry.mime);
  return createVoiceProfile(userId, entry.name, stored.id, entry.id);
}

export async function installPreset(userId: string, presetId: string): Promise<VoiceProfile> {
  const existing = getVoiceProfileByPreset(userId, presetId);
  if (existing) return existing;

  const vieneuPreset = VIENEU_PRESETS.find((preset) => preset.id === presetId);
  if (vieneuPreset) {
    return createPresetVoiceProfile(userId, vieneuPreset.name, vieneuPreset.id, presetId);
  }

  const manifest = await loadManifest();
  const entry = manifest.find((item) => item.id === presetId);
  if (!entry) throw new Error("Không tìm thấy giọng này trong catalog.");
  return installManifestPreset(userId, entry);
}

/**
 * Reads `text` aloud in a catalog voice, without installing it first.
 * Returns `null` if the id isn't in the catalog at all (a 404, not an
 * engine failure) — distinct from a thrown error, which means the id was
 * valid but synthesis itself failed.
 */
export async function previewPreset(presetId: string, text: string): Promise<Buffer | null> {
  const vieneuPreset = VIENEU_PRESETS.find((preset) => preset.id === presetId);
  if (vieneuPreset) {
    return createLocalVoiceEngine().synthesize({ text, presetVoiceId: vieneuPreset.id });
  }

  const manifest = await loadManifest();
  const entry = manifest.find((item) => item.id === presetId);
  if (!entry) return null;
  const bytes = await resolveSampleBytes(entry);
  const dir = await mkdtemp(join(tmpdir(), "sunbee-voice-preset-"));
  try {
    const samplePath = join(dir, "sample");
    await writeFile(samplePath, bytes);
    return createLocalVoiceEngine().synthesize({ text, sampleAudioPath: samplePath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
