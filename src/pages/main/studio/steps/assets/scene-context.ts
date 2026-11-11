import type { RecurringCharacter, RecurringObject, ScriptScene } from "@shared/types";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Content/visual description for the research prompt, plus the locked
 * appearance of any recurring character or object present in this scene —
 * so every asset generated for them (in any scene) starts from the same
 * wording instead of each generation improvising a different look.
 */
export function sceneContextOf(
  scene: ScriptScene,
  characterRoster: RecurringCharacter[],
  objectRoster: RecurringObject[] = [],
): string {
  const names = new Set((scene.characters ?? []).map((c) => c.name));
  const lockedCharacters = characterRoster
    .filter((c) => names.has(c.name))
    .map((c) => `${c.name}: ${c.appearance}`)
    .join(" | ");

  // Objects aren't tracked per-scene the way characters are, so match by
  // name appearing anywhere in this scene's own text instead.
  const sceneText = [
    scene.content,
    scene.visualDescription,
    ...scene.requiredAssets.map((a) => a.description),
  ]
    .join(" ")
    .toLocaleLowerCase();
  const lockedObjects = objectRoster
    .filter((o) => sceneText.includes(o.name.toLocaleLowerCase()))
    .map((o) => `${o.name}: ${o.appearance}`)
    .join(" | ");

  return [
    `${scene.content} | ${scene.visualDescription}`,
    lockedCharacters && `Nhân vật: ${lockedCharacters}`,
    lockedObjects && `Vật phẩm: ${lockedObjects}`,
  ]
    .filter(Boolean)
    .join(" | ");
}
