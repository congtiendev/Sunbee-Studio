import {
  DownloadIcon,
  LayerIcon,
  LayoutIcon,
  TextIcon,
  type IconProps,
} from "@/icons";
import type { ComponentType } from "react";
import type { VideoStudioStepKey } from "../types";
import AssetsStep from "./assets";
import EditPlanStep from "./edit-plan";
import RenderStep from "./render";
import ScriptStep from "./script";
import { SCRIPT_SOURCES } from "./script/sources/registry";

export interface StepComponentProps {
  videoId: string;
  /** Mark the step done, which unlocks "Next" when the step requires completion. */
  onComplete: () => void;
}

/**
 * The Video Studio pipeline. Each step is a self-contained module folder
 * (`steps/<key>/`) with a matching server module (`server/modules/<key>/`);
 * adding a step means adding a folder and one entry here.
 * Labels come from `videoStudio.steps.<key>` and `videoStudio.steps.<key>Hint`.
 */
/**
 * A sub-section of a step in Settings → Prompts. AI tasks declare the group
 * they belong to (`group` on the server task); a group without tasks shows
 * its hint instead. Steps without groups get one tab per task.
 */
export interface PromptGroup {
  key: string;
  /** Full i18n key of the tab title — reuse the step's own UI label so both match. */
  labelKey: string;
  /** Full i18n key shown when the group runs no AI of its own. */
  emptyHintKey?: string;
}

export interface StepDefinition {
  key: VideoStudioStepKey;
  icon: ComponentType<IconProps>;
  Component: ComponentType<StepComponentProps>;
  /** When true, "Next" stays disabled until the step calls `onComplete`. */
  requiresCompletion: boolean;
  promptGroups?: PromptGroup[];
}

export const VIDEO_STUDIO_STEPS: StepDefinition[] = [
  {
    key: "script",
    icon: TextIcon,
    Component: ScriptStep,
    requiresCompletion: true,
    // Same titles as the script source picker, then the analysis every source ends with.
    promptGroups: [
      ...SCRIPT_SOURCES.map((source) => ({
        key: source.key,
        labelKey: `videoStudio.script.${source.labelKey}`,
        emptyHintKey: `settings.prompts.groupHints.${source.key}`,
      })),
      { key: "analyze", labelKey: "videoStudio.script.analyzeButton" },
    ],
  },
  {
    key: "assets",
    icon: LayerIcon,
    Component: AssetsStep,
    requiresCompletion: false,
  },
  {
    key: "editPlan",
    icon: LayoutIcon,
    Component: EditPlanStep,
    requiresCompletion: false,
  },
  {
    key: "render",
    icon: DownloadIcon,
    Component: RenderStep,
    requiresCompletion: false,
  },
];
