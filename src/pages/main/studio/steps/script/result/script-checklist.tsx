import { CheckIcon, XIcon } from "@/icons";
import { cn } from "@/utils";
import { checkNarration } from "@shared/narration";
import type { ScriptAnalyzeResult } from "@shared/types";

export interface ScriptChecklistItem {
  id: string;
  label: string;
  passed: boolean;
}

const MIN_SANE_SCENE_DURATION_SEC = 1;
const MAX_SANE_SCENE_DURATION_SEC = 60;
/** Share of the script's spoken words the scenes' narration must cover (a few words lost to punctuation quirks are fine). */
const MIN_NARRATION_COVERAGE = 0.9;

/** The voiceover reads each scene's narration: all scenes have it and it matches the script. */
function narrationReady(result: ScriptAnalyzeResult, scriptText: string): boolean {
  const check = checkNarration(scriptText, result.scenes);
  return (
    check.missing.length === 0 &&
    check.mismatched.length === 0 &&
    check.coverage >= MIN_NARRATION_COVERAGE
  );
}

export function computeScriptChecklist(
  result: ScriptAnalyzeResult,
  scriptText?: string,
): ScriptChecklistItem[] {
  const sceneCount = result.scenes.length;
  const avgDuration =
    sceneCount > 0
      ? result.scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0) /
        sceneCount
      : 0;

  return [
    {
      id: "sceneCount",
      label: "hasScenes",
      passed: sceneCount >= 1,
    },
    {
      id: "sceneDuration",
      label: "sceneDurationSane",
      passed:
        avgDuration >= MIN_SANE_SCENE_DURATION_SEC &&
        avgDuration <= MAX_SANE_SCENE_DURATION_SEC,
    },
    {
      id: "resources",
      label: "resourcesFilled",
      passed:
        result.resources.shotCount > 0 &&
        result.resources.voiceover.trim().length > 0 &&
        result.resources.images.length > 0,
    },
    {
      id: "requiredAssets",
      label: "scenesHaveAssets",
      passed: result.scenes.every((s) => s.requiredAssets.length > 0),
    },
    ...(scriptText !== undefined
      ? [
          {
            id: "narration",
            label: "narrationMatches",
            passed: narrationReady(result, scriptText),
          },
        ]
      : []),
  ];
}

export default function ScriptChecklist({
  items,
  labels,
}: {
  items: ScriptChecklistItem[];
  labels: Record<string, string>;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full",
              item.passed
                ? "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400"
                : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
            )}
          >
            {item.passed ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <XIcon className="size-3.5" />
            )}
          </span>
          <span
            className={cn(
              item.passed
                ? "text-gray-700 dark:text-gray-300"
                : "text-gray-500 dark:text-gray-400",
            )}
          >
            {labels[item.label] ?? item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
