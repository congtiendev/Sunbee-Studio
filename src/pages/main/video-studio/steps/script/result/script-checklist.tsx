import { CheckIcon, XIcon } from "@/icons";
import { cn } from "@/utils";
import type { ScriptAnalyzeResult } from "@shared/types";

export interface ScriptChecklistItem {
  id: string;
  label: string;
  passed: boolean;
}

const MIN_SANE_SCENE_DURATION_SEC = 1;
const MAX_SANE_SCENE_DURATION_SEC = 60;

export function computeScriptChecklist(
  result: ScriptAnalyzeResult,
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
