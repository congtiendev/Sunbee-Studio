// Prints a video's edit plan (Step 3) as text: per scene, every shot's clips
// with timing, placement and size — to check layout problems without CapCut.
//
//   npx tsx scripts/edit-plan-dump.ts <videoId> [fromScene] [toScene] [--json out.json] [--capcut <folderName>]
//
// Reads the data dir in SUNBEE_DATA_DIR (default: ./data). Building the plan
// only reads, apart from caching sprite frames / downloaded picks the app
// would cache anyway.
import { writeFileSync } from "node:fs";
import { getDb } from "../server/services/db/client.js";
import { buildEditPlan } from "../server/modules/edit-plan/build-timeline.js";
import { writeCapcutDraft } from "../server/services/capcut/writer.js";

const flagValues = new Set(["--json", "--capcut"].filter((f) => process.argv.includes(f)).map((f) => process.argv[process.argv.indexOf(f) + 1]));
const [videoId, from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !flagValues.has(a));
const jsonAt = process.argv.indexOf("--json");
if (!videoId) throw new Error("usage: edit-plan-dump.ts <videoId> [fromScene] [toScene]");
const owner = getDb().prepare("SELECT u.id, u.role FROM videos v JOIN users u ON u.id = v.user_id WHERE v.id = ?").get(videoId) as
  | { id: string; role: "admin" | "user" }
  | undefined;
if (!owner) throw new Error("no such video");

const plan = await buildEditPlan(owner, videoId, {
  fromScene: from ? Number(from) : undefined,
  toScene: to ? Number(to) : undefined,
});
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1]!, JSON.stringify(plan, null, 2));
const s = (ms: number) => (ms / 1000).toFixed(2);
const mediaById = new Map(plan.timeline.media.map((m) => [m.id, m]));
for (const scene of plan.scenes) {
  console.log(`\n== scene ${scene.sceneIndex}  ${s(scene.startMs)}–${s(scene.startMs + scene.durationMs)}s  shots ${scene.shots}`);
  const clips = plan.timeline.visual.filter((c) => c.origin?.sceneIndex === scene.sceneIndex && !/-\d+$/.test(c.id.replace(/-1$/, "")));
  for (const c of clips) {
    const m = mediaById.get(c.mediaId);
    const t = c.transform;
    console.log(
      `  ${c.id.padEnd(16)} L${c.layer} ${c.role.padEnd(10)} ${s(c.startMs)}+${s(c.durationMs)} x=${t.x.toFixed(2)} y=${t.y.toFixed(2)} sc=${t.scale.toFixed(2)} ${m?.width}x${m?.height}${c.capcutIntro ? " intro=" + c.capcutIntro.key : ""}  ${(m?.path ?? "").split(/[\\/]/).pop()}`,
    );
  }
}
console.log("\ntransitions:", (plan.timeline.transitions ?? []).map((t) => `${t.ref.name} after ${t.afterClipId}`).join(", "));
console.log("effects:", (plan.timeline.effects ?? []).map((e) => `${e.ref.name}@${s(e.startMs)}`).join(", "));
console.log("sfx:", plan.timeline.audio.map((a) => `${s(a.startMs)}(${s(a.durationMs)})`).join(" "));
console.log("\nwarnings:", plan.warnings.map((w) => `${w.code}@${w.sceneIndex ?? ""}`).join(" "));
const capcutAt = process.argv.indexOf("--capcut");
if (capcutAt > 0) {
  const draft = await writeCapcutDraft(plan.timeline, { folderName: process.argv[capcutAt + 1] });
  console.log(`\nCapCut draft: ${draft.folderPath}`);
}
