import type { Router } from "express";
import type { AiTaskDefinition } from "../services/ai/task.js";

/**
 * Server side of one Video Studio step. Every step (script, assets,
 * edit plan, render) is a module of this shape under `server/modules/<key>/`;
 * adding a step means adding a folder and one line in `modules/index.ts`.
 */
export interface StepModule {
  /** Matches the frontend step key (`src/pages/main/studio/steps/registry.ts`). */
  key: string;
  /** Mounted at `/api/<mountPath>` when present. */
  mountPath?: string;
  router?: Router;
  /** AI tasks the step runs; listed (and made editable) in Settings → Prompts. */
  tasks: AiTaskDefinition[];
}

/**
 * A feature outside the step pipeline (e.g. AI training), with the same shape:
 * `server/modules/<key>/`, an optional API at `/api/<mountPath>`, and AI tasks that
 * get their own tab in Settings → Prompts (`FEATURE_PROMPT_TABS` on the frontend).
 */
export type FeatureModule = StepModule;
