import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEntry } from "../../shared/types.js";
import { dataDir } from "../env.js";

function logDir(): string {
  return join(dataDir(), "logs");
}

export function listLogDates(): string[] {
  try {
    return readdirSync(logDir())
      .filter((name) => /^server-\d{4}-\d{2}-\d{2}\.log$/.test(name))
      .map((name) => name.slice("server-".length, -".log".length))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

export function readLogEntries(
  date: string | undefined,
  level: string | undefined,
  limit: number,
): LogEntry[] {
  const dates = listLogDates();
  const targetDate = date && dates.includes(date) ? date : dates[0];
  if (!targetDate) return [];

  let raw: string;
  try {
    raw = readFileSync(join(logDir(), `server-${targetDate}.log`), "utf-8");
  } catch {
    return [];
  }

  const entries: LogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (level && entry.level !== level) continue;
      entries.push(entry);
    } catch {
      // skip malformed line
    }
  }

  entries.reverse();
  return entries.slice(0, limit);
}
