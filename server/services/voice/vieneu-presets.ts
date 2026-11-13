/**
 * The 25 built-in voices of VieNeu-TTS v3 Turbo (pnnbao97/VieNeu-TTS,
 * Apache-2.0 — code and model weights both, github.com/pnnbao97/VieNeu-TTS).
 * No per-voice download: the whole model is fetched once by the `vieneu`
 * package itself on first use (cached under TORCH_HOME/HF_HOME, see
 * engine-process.ts) — "installing" one of these just creates a
 * `VoiceProfile` row, nothing to fetch ourselves.
 *
 * The id is also the exact string passed as `voice=` to the SDK — the
 * project doesn't use separate opaque ids, just the display name.
 */
export interface VieneuPreset {
  id: string;
  name: string;
  /** One of the 10 the project recommends starting with (stable, natural). */
  editorsPick: boolean;
}

export const VIENEU_PRESETS: readonly VieneuPreset[] = [
  { id: "Hải Đăng", name: "Hải Đăng", editorsPick: true },
  { id: "Adam bựa", name: "Adam bựa", editorsPick: true },
  { id: "Trúc Ly", name: "Trúc Ly", editorsPick: true },
  { id: "Thiện Minh", name: "Thiện Minh", editorsPick: true },
  { id: "Mai Anh", name: "Mai Anh", editorsPick: true },
  { id: "Thùy Dung", name: "Thùy Dung", editorsPick: true },
  { id: "Thiền Tâm Đức", name: "Thiền Tâm Đức", editorsPick: true },
  { id: "Ngọc Huyền", name: "Ngọc Huyền", editorsPick: true },
  { id: "Quang Sơn", name: "Quang Sơn", editorsPick: true },
  { id: "Ngọc Trân", name: "Ngọc Trân", editorsPick: true },
  { id: "Minh Đức", name: "Minh Đức", editorsPick: false },
  { id: "Phạm Tuyên", name: "Phạm Tuyên", editorsPick: false },
  { id: "Xuân Vĩnh", name: "Xuân Vĩnh", editorsPick: false },
  { id: "Thanh Bình", name: "Thanh Bình", editorsPick: false },
  { id: "Ngọc Linh", name: "Ngọc Linh", editorsPick: false },
  { id: "Đoan Trang", name: "Đoan Trang", editorsPick: false },
  { id: "Quỳnh Anh", name: "Quỳnh Anh", editorsPick: false },
  { id: "Quốc Tuấn", name: "Quốc Tuấn", editorsPick: false },
  { id: "Adam", name: "Adam", editorsPick: false },
  { id: "Thái Sơn", name: "Thái Sơn", editorsPick: false },
  { id: "Thục Đoan", name: "Thục Đoan", editorsPick: false },
  { id: "Minh Triết", name: "Minh Triết", editorsPick: false },
  { id: "Mỹ Duyên", name: "Mỹ Duyên", editorsPick: false },
  { id: "Đức Trí", name: "Đức Trí", editorsPick: false },
  { id: "Kim Thanh", name: "Kim Thanh", editorsPick: false },
];
