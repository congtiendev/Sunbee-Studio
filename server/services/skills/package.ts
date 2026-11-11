import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import type {
  SkillImportResult,
  SkillInput,
  SunbeeSkillPackage,
} from "../../../shared/types.js";
import { saveScriptVersion } from "../../modules/script/repo.js";
import { getDb } from "../db/client.js";
import { createDocument, linkDocument, listLinkedDocuments } from "../db/documents-repo.js";
import {
  addReferenceImage,
  getTemplateById,
  saveTemplate,
  setSkillExamples,
} from "../db/style-templates-repo.js";
import { getFileForUser, saveFile } from "../storage/files.js";
import { getSkillExamples, withSkillDefaults, type Caller } from "./skills.js";

/** The manifest entry name inside an exported `.sunbee-skill.zip`. */
const MANIFEST_NAME = "sunbee-skill.json";
const IMAGES_DIR = "images";

const TEXT_EXTENSIONS = new Set([
  ".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".csv", ".tsv",
  ".py", ".js", ".ts", ".html", ".xml", ".sh",
]);
const MAX_TEXT_FILE_BYTES = 512 * 1024;

// ---------- export ----------

export function exportSkill(caller: Caller, skillId: string): SunbeeSkillPackage | null {
  const skill = getTemplateById(caller.id, caller.role === "admin", skillId);
  if (!skill) return null;
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    userId: _userId,
    ownerEmail: _ownerEmail,
    // Internal file ids, meaningless outside this install — the zip export
    // carries the actual image bytes under `images/` instead.
    referenceImageFileIds: _referenceImageFileIds,
    ...input
  } = skill;
  return {
    format: "sunbee-skill",
    version: 1,
    exportedAt: new Date().toISOString(),
    skill: input,
    examples: getSkillExamples(caller, skillId).map((record) => ({
      scriptText: record.scriptText,
      sourceType: record.sourceType,
      scenes: record.scenes,
      resources: record.resources,
      style: record.style,
    })),
    documents: listLinkedDocuments("skill", skillId).map((doc) => ({
      title: doc.title,
      mime: doc.mime,
      textContent: doc.textContent,
    })),
  };
}

/**
 * The portable form of a skill: a `.zip` with `sunbee-skill.json` (the same
 * manifest `exportSkill` returns) plus the actual bytes of every reference
 * image under `images/`, so an "image" skill's style sample travels with it
 * instead of exporting dangling internal file ids.
 */
export async function exportSkillZip(caller: Caller, skillId: string): Promise<Buffer | null> {
  const pkg = exportSkill(caller, skillId);
  if (!pkg) return null;
  const skill = getTemplateById(caller.id, caller.role === "admin", skillId)!;
  const zip = new JSZip();
  zip.file(MANIFEST_NAME, JSON.stringify(pkg, null, 2));
  for (const [index, fileId] of skill.referenceImageFileIds.entries()) {
    const file = getFileForUser(caller.id, caller.role === "admin", fileId);
    if (!file) continue;
    const buffer = readFileSync(file.absolutePath);
    zip.file(`${IMAGES_DIR}/${index}-${file.originalName}`, buffer);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

// ---------- import ----------

function importPackage(caller: Caller, pkg: SunbeeSkillPackage): SkillImportResult {
  if (pkg.format !== "sunbee-skill" || pkg.version !== 1 || !pkg.skill?.name) {
    throw new Error("File skill không hợp lệ.");
  }
  const db = getDb();
  return db.transaction((): SkillImportResult => {
    const skill = saveTemplate(caller.id, withSkillDefaults(pkg.skill));
    // Examples come back as approved versions not tied to any video.
    const exampleIds = (pkg.examples ?? []).map(
      (example) =>
        saveScriptVersion(
          caller.id,
          example.sourceType ?? "import",
          undefined,
          example.scriptText,
          [],
          "analyzed",
          {
            scenes: example.scenes,
            resources: example.resources,
            style: example.style ?? {
              genre: skill.genre,
              styleTags: skill.styleTags,
              toneDescription: skill.toneDescription,
            },
          },
          undefined,
          { approved: true },
        ).id,
    );
    setSkillExamples(skill.id, exampleIds);
    for (const doc of pkg.documents ?? []) {
      const created = createDocument(caller.id, doc);
      linkDocument(created.id, "skill", skill.id);
    }
    return {
      skill,
      examples: exampleIds.length,
      documents: pkg.documents?.length ?? 0,
      skippedFiles: [],
    };
  })();
}

/** A `.sunbee-skill.zip`: the manifest plus actual reference-image bytes under `images/`. */
async function importSunbeeSkillZip(caller: Caller, zip: JSZip): Promise<SkillImportResult> {
  const manifestEntry = zip.file(MANIFEST_NAME);
  if (!manifestEntry) throw new Error(`Không tìm thấy ${MANIFEST_NAME} trong file .zip.`);
  let pkg: SunbeeSkillPackage;
  try {
    pkg = JSON.parse(await manifestEntry.async("string")) as SunbeeSkillPackage;
  } catch {
    throw new Error("File JSON không đọc được.");
  }
  const result = importPackage(caller, pkg);

  const imageEntries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith(`${IMAGES_DIR}/`),
  );
  const admin = caller.role === "admin";
  for (const entry of imageEntries) {
    const buffer = await entry.async("nodebuffer");
    const originalName = posix.basename(entry.name).replace(/^\d+-/, "");
    const mime = originalName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const stored = await saveFile(caller.id, "skill-attachment", buffer, originalName, mime);
    try {
      addReferenceImage(caller.id, admin, result.skill.id, stored.id);
    } catch {
      // Already at the 10-image cap — the rest of the skill still imported fine.
    }
  }
  return result;
}

/** Splits YAML frontmatter (`---` block) from a SKILL.md. Only flat `key: value` pairs are read. */
export function parseSkillMd(text: string): { meta: Record<string, string>; body: string } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(match[0].length).trim() };
}

function agentSkillInput(skillMd: string, fallbackName: string): SkillInput {
  const { meta, body } = parseSkillMd(skillMd);
  return withSkillDefaults({
    name: meta.name || fallbackName,
    description: meta.description ?? "",
    instructions: body,
    origin: "anthropic",
    skillMd,
  });
}

function importAgentSkill(
  caller: Caller,
  skillMd: string,
  fallbackName: string,
  files: { path: string; text: string }[],
  skippedFiles: string[],
): SkillImportResult {
  const db = getDb();
  return db.transaction((): SkillImportResult => {
    const skill = saveTemplate(caller.id, agentSkillInput(skillMd, fallbackName));
    for (const file of files) {
      const created = createDocument(caller.id, {
        title: file.path,
        mime: "text/plain",
        textContent: file.text,
      });
      linkDocument(created.id, "skill", skill.id);
    }
    return { skill, examples: 0, documents: files.length, skippedFiles };
  })();
}

/** A `.zip`: a native `.sunbee-skill.zip` (has `sunbee-skill.json` at its root) or an Agent Skill `.zip` (has `SKILL.md`). */
async function importZip(caller: Caller, buffer: Buffer, filename: string) {
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file(MANIFEST_NAME)) return importSunbeeSkillZip(caller, zip);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  // The skill root is the folder holding the shallowest SKILL.md.
  const skillMdEntry = entries
    .filter((f) => posix.basename(f.name).toLowerCase() === "skill.md")
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
  if (!skillMdEntry) throw new Error("Không tìm thấy SKILL.md trong file .zip.");
  const root = posix.dirname(skillMdEntry.name);
  const inRoot = (name: string) => root === "." || name.startsWith(`${root}/`);

  const files: { path: string; text: string }[] = [];
  const skippedFiles: string[] = [];
  for (const entry of entries) {
    if (entry === skillMdEntry || !inRoot(entry.name)) continue;
    const relative = root === "." ? entry.name : entry.name.slice(root.length + 1);
    const data = await entry.async("nodebuffer");
    if (!TEXT_EXTENSIONS.has(posix.extname(entry.name).toLowerCase()) || data.length > MAX_TEXT_FILE_BYTES) {
      skippedFiles.push(relative);
      continue;
    }
    files.push({ path: relative, text: data.toString("utf-8") });
  }

  const skillMd = await skillMdEntry.async("string");
  const fallbackName = root === "." ? filename.replace(/\.zip$/i, "") : posix.basename(root);
  return importAgentSkill(caller, skillMd, fallbackName, files, skippedFiles);
}

/** Imports a `.sunbee-skill.zip`/legacy `.sunbee-skill.json`, an Agent Skill `SKILL.md`, or an Agent Skill `.zip`. */
export async function importSkillFile(
  caller: Caller,
  filename: string,
  buffer: Buffer,
): Promise<SkillImportResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return importZip(caller, buffer, filename);
  const text = buffer.toString("utf-8");
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return importAgentSkill(caller, text, filename.replace(/\.(md|markdown)$/i, ""), [], []);
  }
  if (lower.endsWith(".json")) {
    let pkg: SunbeeSkillPackage;
    try {
      pkg = JSON.parse(text) as SunbeeSkillPackage;
    } catch {
      throw new Error("File JSON không đọc được.");
    }
    return importPackage(caller, pkg);
  }
  throw new Error("Chỉ hỗ trợ file .sunbee-skill.json, SKILL.md hoặc .zip của Agent Skill.");
}
