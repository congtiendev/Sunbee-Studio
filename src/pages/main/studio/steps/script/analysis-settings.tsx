import AiSettingsFields from "@/components/shared/ai-settings-fields";
import { useTranslations } from "@/i18n";
import EditingSkillSelect from "./editing-skill-select";
import type { ScriptStepState } from "./use-script-step";

/** Provider, model, effort and skill used by "Analyze script". */
export default function AnalysisSettings({ step }: { step: ScriptStepState }) {
  const t = useTranslations("videoStudio.script");

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <AiSettingsFields
          providerLabel={t("providerLabel")}
          provider={step.provider}
          onProviderChange={step.changeProvider}
          model={step.model}
          onModelChange={step.setModel}
          availableProviders={step.availableProviders}
          effort={step.effort}
          onEffortChange={step.setEffort}
        />
      </div>
      {!step.availableProviders.openai || !step.availableProviders.claude ? (
        <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t("providerMissingKeyHint")}
        </p>
      ) : null}

      <EditingSkillSelect step={step} />
    </>
  );
}
