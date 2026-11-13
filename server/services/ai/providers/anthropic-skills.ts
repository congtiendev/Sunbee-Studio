import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillFolder } from "./types.js";

interface SkillFile {
  /** Path inside the skill folder, with "/" separators. */
  rel: string;
  data: Buffer;
}

async function readSkillFiles(dir: string): Promise<SkillFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
  return Promise.all(
    paths.map(async (full) => ({
      rel: path.relative(dir, full).split(path.sep).join("/"),
      data: await readFile(full),
    })),
  );
}

function contentHash(files: SkillFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.rel).update("\0").update(file.data).update("\0");
  }
  return hash.digest("hex");
}

/** Skill ids per (API key, folder contents): uploaded once per server process at most. */
const skillIds = new Map<string, Promise<string>>();

/**
 * The id of `folder` as a custom skill in the API key's workspace — found by
 * its display name (which carries a hash of the folder's contents), or
 * uploaded when missing. Editing the folder therefore uploads a new skill
 * instead of reusing a stale one.
 */
export async function ensureSkill(client: Anthropic, apiKey: string, folder: SkillFolder): Promise<string> {
  const files = await readSkillFiles(folder.dir);
  if (!files.some((file) => file.rel === "SKILL.md")) {
    throw new Error(`Thư mục skill thiếu SKILL.md: ${folder.dir}`);
  }
  const hash = contentHash(files);
  const cacheKey = `${createHash("sha256").update(apiKey).digest("hex")}:${hash}`;
  let pending = skillIds.get(cacheKey);
  if (!pending) {
    pending = findOrUpload(client, folder, files, hash).catch((err: unknown) => {
      skillIds.delete(cacheKey);
      throw err;
    });
    skillIds.set(cacheKey, pending);
  }
  return pending;
}

async function findOrUpload(
  client: Anthropic,
  folder: SkillFolder,
  files: SkillFile[],
  hash: string,
): Promise<string> {
  const displayName = `${folder.name} (sunbee ${hash.slice(0, 12)})`;
  for await (const skill of client.skills.list({ source: "custom" })) {
    if (skill.display_name === displayName) return skill.id;
  }
  const skill = await client.skills.create({
    display_name: displayName,
    files: await Promise.all(files.map((file) => toFile(file.data, `${folder.name}/${file.rel}`))),
  });
  return skill.id;
}
