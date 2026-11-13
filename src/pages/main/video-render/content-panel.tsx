import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { ArrowRightIcon, SparkIcon } from "@/icons";
import ScriptEditor from "@/pages/main/studio/steps/script/script-editor";
import ScriptSourcePicker from "@/pages/main/studio/steps/script/source-picker";
import { SCRIPT_SOURCES } from "@/pages/main/studio/steps/script/sources/registry";
import { useState } from "react";
import type { RenderProjectState } from "@/pages/main/video-render/use-render-project";
import {
  sourceKeyOf,
  sourceModeOf,
  useRenderScriptSource,
} from "@/pages/main/video-render/use-render-script-source";

/**
 * The project's script, with the Video Studio's own script UI (source picker,
 * source panels, script editor) — wired to this project, so nothing is saved
 * in the Studio — then AI scene splitting, which moves on to the scenes when it succeeds.
 */
export default function ContentPanel({
  state,
  onSplitDone,
}: {
  state: RenderProjectState;
  onSplitDone: () => void;
}) {
  const t = useTranslations("videoRender.content");
  const tScript = useTranslations("videoStudio.script");
  const step = useRenderScriptSource(state);
  const [confirmSplit, setConfirmSplit] = useState(false);
  const project = state.project!;
  const source = SCRIPT_SOURCES.find((s) => s.key === sourceKeyOf(project.sourceMode)) ?? SCRIPT_SOURCES[0]!;
  const SourcePanel = source.Panel;

  const runSplit = async () => {
    if (await state.splitScenes()) onSplitDone();
  };

  const split = () => {
    if (project.scenes.length > 0) setConfirmSplit(true);
    else void runSplit();
  };

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <CardTitle>{tScript("sourceTitle")}</CardTitle>

      <ScriptSourcePicker
        value={sourceKeyOf(project.sourceMode)}
        onChange={(key) => state.patch({ sourceMode: sourceModeOf(key) })}
        disabled={state.busy}
      />

      {SourcePanel && <SourcePanel step={step} />}

      <div className="flex h-[30rem] items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.02]">
        <ScriptEditor step={step} showResultHint={source.producesScript} className="min-w-0 flex-1" />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t("scriptHint")}</p>

      <div className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4 sm:flex-row sm:items-center dark:border-brand-500/20 dark:bg-brand-500/[0.06]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <SparkIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{t("splitTitle")}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{t("splitHint")}</p>
        </div>
        <Button className="gap-1.5 rounded-full" onClick={split} disabled={state.busy || !project.scriptText.trim()}>
          {state.splitting ? <Spinner /> : <ArrowRightIcon className="size-4 rtl:rotate-180" />}
          {state.splitting ? t("splitting") : t("splitButton")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSplit}
        onOpenChange={setConfirmSplit}
        title={t("splitConfirmTitle")}
        description={t("splitConfirmDescription")}
        confirmLabel={t("splitConfirm")}
        onConfirm={runSplit}
      />
    </Card>
  );
}
