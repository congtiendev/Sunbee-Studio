import { createHash } from "node:crypto";
import { promptOf, runTask, type TaskContext } from "../../services/ai/task.js";
import type { ProviderKey } from "../../services/ai/providers/index.js";
import { chunkScriptText } from "../script/chunking.js";
import { BUDGET, budgetFor, sharesOf } from "./budget.js";
import { getDigest, saveDigest } from "./repo.js";
import type { SourceDigest, TrainingMaterial } from "./sources/types.js";
import {
  digestSourceTask,
  type DigestSourceOutput,
} from "./tasks/digest-source.js";

/** Parallel AI calls while reading sources (keeps rate limits and memory in check). */
const CONCURRENCY = 3;
/** Notes kept per list after merging a source's parts. */
const LIMITS = {
  voice: 40,
  structure: 30,
  visual: 20,
  knowledge: 40,
  sampleLines: 8,
};

/** Indexes of the materials too long to pass verbatim within their share of the prompt. */
export function planDigests(materials: TrainingMaterial[]): Set<number> {
  const planned = new Set<number>();
  for (const role of ["sample", "reference"] as const) {
    const indexed = materials
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === role);
    const shares = sharesOf(
      indexed.map(({ m }) => m),
      budgetFor(role),
    );
    indexed.forEach(({ m, i }, k) => {
      if (m.text.length > shares[k]!) planned.add(i);
    });
  }
  return planned;
}

function scenesJsonOf(material: TrainingMaterial): string | undefined {
  if (!material.scenes?.length) return undefined;
  return JSON.stringify(
    material.scenes.slice(0, 40).map((s) => ({
      role: s.narrativeRole,
      shot: s.shotSize,
      camera: s.cameraMovement,
      sec: s.estimatedDurationSec,
      hero: s.heroMoment,
      visual: s.visualDescription.slice(0, 160),
    })),
  );
}

function mergeParts(parts: DigestSourceOutput[], chars: number): SourceDigest {
  const merged = (key: keyof DigestSourceOutput) => {
    const seen = new Set<string>();
    return parts
      .flatMap((part) => part[key] ?? [])
      .map((line) => line.trim())
      .filter((line) => {
        const norm = line.toLocaleLowerCase();
        if (!line || seen.has(norm)) return false;
        seen.add(norm);
        return true;
      })
      .slice(0, LIMITS[key]);
  };
  return {
    voice: merged("voice"),
    structure: merged("structure"),
    visual: merged("visual"),
    knowledge: merged("knowledge"),
    sampleLines: merged("sampleLines"),
    chars,
    parts: parts.length,
  };
}

/** Runs `jobs` with at most `limit` in flight, keeping their order. */
async function pool<T>(
  jobs: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]!();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, worker),
  );
  return results;
}

/**
 * Makes long material fit: every source that can't pass verbatim within its
 * share is read in full by the AI first — in parts when it is very long — and
 * gets `digest` notes the training prompt uses instead of a truncated text.
 * Notes are cached by source text + digest prompt + model, so re-training (which
 * re-reads everything a skill learned) only reads what is new or changed.
 */
export async function withDigests(
  materials: TrainingMaterial[],
  ctx: TaskContext,
  ai: { provider: ProviderKey; model?: string },
): Promise<TrainingMaterial[]> {
  const planned = planDigests(materials);
  if (planned.size === 0) return materials;

  const promptHash = createHash("sha256")
    .update(promptOf(ctx, digestSourceTask, "system"))
    .digest("hex")
    .slice(0, 16);

  // Every part of every planned source is one job, so a few long sources still
  // run in parallel; results are regrouped per source afterwards.
  type Plan = {
    index: number;
    key: string;
    chunks: string[];
    cached: SourceDigest | null;
  };
  const plans: Plan[] = [...planned].map((index) => {
    const material = materials[index]!;
    const textHash = createHash("sha256").update(material.text).digest("hex");
    const key = `${textHash}:${promptHash}:${ai.provider}:${ai.model ?? "default"}`;
    const cached = getDigest(key);
    const parts = Math.max(
      1,
      Math.ceil(material.text.length / BUDGET.digestChunk),
    );
    return {
      index,
      key,
      chunks: cached ? [] : chunkScriptText(material.text, parts),
      cached,
    };
  });

  const jobs = plans.flatMap((plan) =>
    plan.chunks.map((chunk, part) => async () => {
      const material = materials[plan.index]!;
      const output = await runTask(
        digestSourceTask,
        {
          title: material.title,
          role: material.role,
          text: chunk,
          part: part + 1,
          parts: plan.chunks.length,
          scenesJson: part === 0 ? scenesJsonOf(material) : undefined,
          provider: ai.provider,
          model: ai.model,
        },
        ctx,
      );
      return { plan, output };
    }),
  );
  const outputs = await pool(jobs, CONCURRENCY);

  const result = [...materials];
  for (const plan of plans) {
    const material = materials[plan.index]!;
    let digest = plan.cached;
    if (!digest) {
      digest = mergeParts(
        outputs.filter((o) => o.plan === plan).map((o) => o.output),
        material.text.length,
      );
      saveDigest(plan.key, digest);
    }
    result[plan.index] = { ...material, digest };
  }
  return result;
}
