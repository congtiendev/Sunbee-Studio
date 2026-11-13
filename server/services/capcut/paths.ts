import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * CapCut desktop's draft store — every subfolder is one project. CapCut lists
 * what it finds here when it starts, so a draft written while it's running
 * shows up only after it's quit and reopened.
 *
 * `SUNBEE_CAPCUT_DRAFTS` overrides it (a custom CapCut drafts location, or a
 * scratch folder to test the writer without touching CapCut).
 */
export function defaultCapcutDraftsRoot(): string | null {
  const override = process.env.SUNBEE_CAPCUT_DRAFTS;
  if (override) return override;
  const candidates =
    process.platform === "win32"
      ? [join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "CapCut", "User Data", "Projects", "com.lveditor.draft")]
      : [join(homedir(), "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft")];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** An ASCII folder name for a draft: "sunbee_<slug>_<yyyymmdd-hhmmss>". */
export function draftFolderName(name: string, now = new Date()): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "video";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `sunbee_${slug}_${stamp}`;
}
