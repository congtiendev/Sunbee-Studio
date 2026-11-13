import { randomUUID } from "node:crypto";
import type { VoiceProfile } from "../../../shared/types.js";
import { getDb } from "../../services/db/client.js";

interface VoiceProfileRow {
  id: string;
  user_id: string;
  name: string;
  engine: "local";
  sample_file_id: string | null;
  created_at: string;
  preset_id: string | null;
  preset_voice_id: string | null;
}

function rowToProfile(row: VoiceProfileRow): VoiceProfile {
  return {
    id: row.id,
    name: row.name,
    engine: row.engine,
    sampleFileId: row.sample_file_id ?? undefined,
    presetVoiceId: row.preset_voice_id ?? undefined,
    createdAt: row.created_at,
    presetId: row.preset_id ?? undefined,
  };
}

export function listVoiceProfiles(userId: string): VoiceProfile[] {
  return (
    getDb()
      .prepare("SELECT * FROM voice_profiles WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as VoiceProfileRow[]
  ).map(rowToProfile);
}

export function getVoiceProfile(userId: string, id: string): VoiceProfile | null {
  const row = getDb()
    .prepare("SELECT * FROM voice_profiles WHERE user_id = ? AND id = ?")
    .get(userId, id) as VoiceProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

/** Whether `presetId` is already installed for this user (install is idempotent). */
export function getVoiceProfileByPreset(userId: string, presetId: string): VoiceProfile | null {
  const row = getDb()
    .prepare("SELECT * FROM voice_profiles WHERE user_id = ? AND preset_id = ?")
    .get(userId, presetId) as VoiceProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

function insertRow(row: VoiceProfileRow): VoiceProfile {
  getDb()
    .prepare(
      `INSERT INTO voice_profiles
         (id, user_id, name, engine, sample_file_id, created_at, preset_id, preset_voice_id)
       VALUES (@id, @user_id, @name, @engine, @sample_file_id, @created_at, @preset_id, @preset_voice_id)`,
    )
    .run(row);
  return rowToProfile(row);
}

/** A voice cloned from the user's own reference sample. */
export function createVoiceProfile(
  userId: string,
  name: string,
  sampleFileId: string,
  presetId?: string,
): VoiceProfile {
  return insertRow({
    id: randomUUID(),
    user_id: userId,
    name,
    engine: "local",
    sample_file_id: sampleFileId,
    created_at: new Date().toISOString(),
    preset_id: presetId ?? null,
    preset_voice_id: null,
  });
}

/** One of VieNeu-TTS's built-in voices — no sample, installed from the catalog. */
export function createPresetVoiceProfile(
  userId: string,
  name: string,
  presetVoiceId: string,
  presetId: string,
): VoiceProfile {
  return insertRow({
    id: randomUUID(),
    user_id: userId,
    name,
    engine: "local",
    sample_file_id: null,
    created_at: new Date().toISOString(),
    preset_id: presetId,
    preset_voice_id: presetVoiceId,
  });
}

/** Deletes the row; returns the sample's file id to also delete (only sample-based profiles have one), or `undefined` if the row didn't exist. */
export function deleteVoiceProfile(userId: string, id: string): string | null | undefined {
  const row = getDb()
    .prepare("SELECT sample_file_id FROM voice_profiles WHERE user_id = ? AND id = ?")
    .get(userId, id) as { sample_file_id: string | null } | undefined;
  if (!row) return undefined;
  getDb().prepare("DELETE FROM voice_profiles WHERE user_id = ? AND id = ?").run(userId, id);
  return row.sample_file_id;
}
