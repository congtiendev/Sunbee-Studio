export interface VoiceSynthesisRequest {
  text: string;
  /** Absolute path to the reference sample (the voice to clone), read fresh each call. Exactly one of this or `presetVoiceId`. */
  sampleAudioPath?: string;
  /** A built-in voice id (see `vieneu-presets.ts`) — no sample needed. */
  presetVoiceId?: string;
  language?: string;
}

/**
 * One adapter per voice engine. Only a local sidecar exists today
 * (`local-engine.ts`); a cloud TTS vendor would be a sibling file of the
 * same shape.
 */
export interface VoiceProvider {
  /** Returns the generated audio (WAV). */
  synthesize(req: VoiceSynthesisRequest): Promise<Buffer>;
}
