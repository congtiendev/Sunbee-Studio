import type { SceneShot, ScriptScene, ShotAngle } from "./types.js";

/**
 * How a shot is spelled to an AI (prompts are Vietnamese) — the prompt writer,
 * the ChatGPT pack and the studio's own image sources all describe a shot the
 * same way, so an image is drawn for exactly the framing its shot calls for.
 */

export const SHOT_ANGLES: readonly ShotAngle[] = [
  "eyeLevel",
  "highAngle",
  "lowAngle",
  "topDown",
  "overShoulder",
  "pov",
  "dutch",
];

const SIZE_VI: Record<SceneShot["shotSize"], string> = {
  extremeCloseUp: "cực cận",
  closeUp: "cận cảnh",
  medium: "trung cảnh",
  wide: "toàn cảnh",
  extremeWide: "viễn cảnh",
};

const ANGLE_VI: Record<ShotAngle, string> = {
  eyeLevel: "ngang tầm mắt",
  highAngle: "góc cao nhìn xuống",
  lowAngle: "góc thấp nhìn lên",
  topDown: "từ trên xuống (top-down)",
  overShoulder: "qua vai nhân vật",
  pov: "góc nhìn thứ nhất (POV)",
  dutch: "nghiêng khung (dutch)",
};

const MOVE_VI: Record<SceneShot["cameraMovement"], string> = {
  static: "máy tĩnh",
  pan: "lia ngang",
  tilt: "lia dọc",
  zoom: "zoom/đẩy máy",
  handheld: "cầm tay",
  tracking: "máy theo chuyển động",
};

/** "Shot 2/6 · cận cảnh · từ trên xuống · máy tĩnh · 2s — Insert: màn hình sáng lên (mục đích: …)". */
export function describeShotForAi(shot: SceneShot, total?: number): string {
  const head = [
    `Shot ${shot.order}${total ? `/${total}` : ""}`,
    SIZE_VI[shot.shotSize],
    ANGLE_VI[shot.angle],
    MOVE_VI[shot.cameraMovement],
    `${shot.durationSec}s`,
  ].join(" · ");
  // The camera/transition technique decides how the image is framed and composed.
  return `${head} — ${shot.subject}${shot.purpose ? ` (mục đích: ${shot.purpose})` : ""}${
    shot.technique?.trim() ? ` [kỹ thuật quay/chuyển cảnh: ${shot.technique.trim()}]` : ""
  }`;
}

/** The shot an image of `scene` belongs to, if the scene was broken into shots. */
export function shotOf(scene: ScriptScene, shotOrder: number | undefined): SceneShot | undefined {
  if (!shotOrder) return undefined;
  return scene.shots?.find((shot) => shot.order === shotOrder);
}
