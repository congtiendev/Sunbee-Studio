import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { useEffect, useState } from "react";
import type { ScriptStepState } from "./use-script-step";

/** Shows whether the current hand-edits are saved, and a fallback "Save now" next to the history button. */
export default function SaveStatus({ step }: { step: ScriptStepState }) {
  const t = useTranslations("videoStudio.script");
  // Ticks once a minute so "X phút trước" keeps counting up while dirty —
  // read from state (not Date.now() inline) so rendering itself stays pure.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    if (!step.scriptTextDirty) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [step.scriptTextDirty]);

  if (step.savingText) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Spinner className="size-3.5" />
        {t("saveStatus.saving")}
      </span>
    );
  }

  if (!step.scriptTextDirty) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {step.lastSavedAt
          ? t("saveStatus.saved", { time: step.lastSavedAt.toLocaleTimeString() })
          : null}
      </span>
    );
  }

  const minutes = step.lastSavedAt
    ? Math.max(0, Math.floor((nowMs - step.lastSavedAt.getTime()) / 60_000))
    : 0;

  return (
    <span className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
      {minutes > 0 ? t("saveStatus.unsavedMinutes", { minutes }) : t("saveStatus.unsavedJustNow")}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => void step.saveScriptTextNow()}
      >
        {t("saveStatus.saveNow")}
      </Button>
    </span>
  );
}
