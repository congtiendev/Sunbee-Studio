import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import ProviderModelFields from "./provider-model-fields";
import SkillSelectField from "./skill-select-field";
import type { AnalyzeEffort, ScriptStepState } from "./use-script-step";

/** Provider, model, effort and skill used by "Analyze script". */
export default function AnalysisSettings({ step }: { step: ScriptStepState }) {
  const t = useTranslations("videoStudio.script");
  const effortLabels: Record<AnalyzeEffort, string> = {
    low: t("effortLow"),
    medium: t("effortMedium"),
    high: t("effortHigh"),
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <ProviderModelFields
          providerLabel={t("providerLabel")}
          provider={step.provider}
          onProviderChange={step.changeProvider}
          model={step.model}
          onModelChange={step.setModel}
          availableProviders={step.availableProviders}
        />

        <Field className="w-40">
          <FieldLabel>{t("effortLabel")}</FieldLabel>
          <Select
            value={step.effort}
            onValueChange={(value) => step.setEffort(value as AnalyzeEffort)}
          >
            <SelectTrigger>
              <SelectValue>{() => effortLabels[step.effort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{effortLabels.low}</SelectItem>
              <SelectItem value="medium">{effortLabels.medium}</SelectItem>
              <SelectItem value="high">{effortLabels.high}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {!step.availableProviders.openai || !step.availableProviders.claude ? (
        <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t("providerMissingKeyHint")}
        </p>
      ) : null}

      <SkillSelectField step={step} />
    </>
  );
}
