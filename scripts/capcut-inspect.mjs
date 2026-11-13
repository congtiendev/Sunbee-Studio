// Dumps the structure of a CapCut draft folder, to study the (undocumented)
// format of the installed CapCut before the writer in server/services/capcut/
// relies on it. Read-only.
//
//   node scripts/capcut-inspect.mjs                 → list drafts in the CapCut draft store
//   node scripts/capcut-inspect.mjs <draft folder>  → full report on stdout
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const STORE = join(
  process.env.LOCALAPPDATA ?? "",
  "CapCut",
  "User Data",
  "Projects",
  "com.lveditor.draft",
);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? [full + "/", ...walk(full)] : [full];
  });
}

function readJson(file) {
  const buffer = readFileSync(file);
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  try {
    return { json: JSON.parse(text) };
  } catch {
    const printable = [...buffer.subarray(0, 64)].filter((b) => b >= 32 && b < 127).length / Math.min(64, buffer.length || 1);
    return { error: printable < 0.8 ? "binary / encrypted" : "not valid JSON", head: buffer.subarray(0, 32).toString("hex") };
  }
}

const shape = (value) =>
  Array.isArray(value) ? `array(${value.length})` : value === null ? "null" : typeof value === "object" ? "object" : `${typeof value} = ${JSON.stringify(value).slice(0, 80)}`;

function reportDraft(draftPath, doc) {
  console.log(`\n### ${draftPath}`);
  console.log("top-level keys:");
  for (const [key, value] of Object.entries(doc)) console.log(`  ${key}: ${shape(value)}`);
  console.log("canvas_config:", JSON.stringify(doc.canvas_config));
  console.log("platform:", JSON.stringify(doc.platform));

  const materials = doc.materials ?? {};
  console.log("materials (non-empty):");
  for (const [key, list] of Object.entries(materials)) {
    if (Array.isArray(list) && list.length) console.log(`  ${key}: ${list.length}`);
  }
  const byId = new Map();
  for (const [key, list] of Object.entries(materials)) {
    if (Array.isArray(list)) for (const item of list) if (item?.id) byId.set(item.id, { kind: key, item });
  }

  for (const [i, track] of (doc.tracks ?? []).entries()) {
    const { segments, ...rest } = track;
    console.log(`\ntrack[${i}] ${JSON.stringify(rest)} — ${segments.length} segment(s)`);
    for (const [j, segment] of segments.entries()) {
      const material = byId.get(segment.material_id);
      console.log(`  segment[${j}] material=${material?.kind ?? "?"} target=${JSON.stringify(segment.target_timerange)} source=${JSON.stringify(segment.source_timerange)}`);
      console.log(`    extra_material_refs: ${segment.extra_material_refs.map((id) => byId.get(id)?.kind ?? `?${id}`).join(", ")}`);
      if (segment.common_keyframes?.length) {
        console.log(`    keyframes: ${segment.common_keyframes.map((k) => `${k.property_type}×${k.keyframe_list.length}`).join(", ")}`);
      }
    }
    // One full sample per track (first segment), with every material it references.
    if (segments[0]) {
      const segment = segments[0];
      console.log(`  --- sample segment (track ${i}):\n${JSON.stringify(segment, null, 2)}`);
      for (const id of [segment.material_id, ...segment.extra_material_refs]) {
        const ref = byId.get(id);
        if (ref) console.log(`  --- material ${ref.kind}:\n${JSON.stringify(ref.item, null, 2)}`);
      }
    }
  }
}

const target = process.argv[2];
if (!target) {
  console.log(`Draft store: ${STORE}`);
  for (const name of readdirSync(STORE)) {
    const full = join(STORE, name);
    if (statSync(full).isDirectory()) console.log(`  ${name}  (${statSync(full).mtime.toISOString()})`);
  }
  for (const file of ["root_meta_info.json"]) {
    try {
      console.log(`${file}: ${shape(JSON.parse(readFileSync(join(STORE, file), "utf8")))}`);
    } catch {
      /* absent */
    }
  }
  process.exit(0);
}

console.log("# files");
for (const file of walk(target)) {
  const rel = relative(target, file);
  if (file.endsWith("/")) console.log(`  ${rel}`);
  else {
    const size = statSync(file).size;
    const kind = !/\.(json|tmp)$/.test(file) ? "" : size === 0 ? "empty" : readJson(file).json ? "json" : readJson(file).error;
    console.log(`  ${rel}  ${size}B ${kind}`);
  }
}

for (const file of walk(target).filter((f) => /draft_(info|content)\.json$|template-2\.tmp$/.test(f))) {
  const { json, error } = readJson(file);
  if (json?.tracks) reportDraft(relative(target, file), json);
  else if (error) console.log(`\n### ${relative(target, file)}: ${error}`);
}
for (const file of walk(target).filter((f) => /(meta_info|project|virtual_store)[^/]*\.json$/.test(f))) {
  const { json, error } = readJson(file);
  console.log(`\n### ${relative(target, file)}${error ? `: ${error}` : ""}`);
  if (json) console.log(JSON.stringify(json, null, 2).slice(0, 4000));
}
