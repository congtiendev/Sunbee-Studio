import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import ProviderModelFields from "../provider-model-fields";
import SkillSelectField from "../skill-select-field";
import type { ScriptLanguage } from "../use-script-step";
import type { ScriptSourcePanelProps } from "./registry";

/** Source "idea": the AI writes the whole script straight from a short idea, no source material. */
export default function IdeaPanel({ step }: ScriptSourcePanelProps) {
  const t = useTranslations("videoStudio.script");

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel>{t("fromIdea.ideaLabel")}</FieldLabel>
        <Textarea
          rows={3}
          value={step.idea}
          onChange={(e) => step.setIdea(e.target.value)}
          placeholder={t("fromIdea.ideaPlaceholder")}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-3">
        <ProviderModelFields
          providerLabel={t("fromDocument.providerLabel")}
          provider={step.describeProvider}
          onProviderChange={step.changeDescribeProvider}
          model={step.describeModel}
          onModelChange={step.setDescribeModel}
          availableProviders={step.availableProviders}
        />
        <Field className="w-36">
          <FieldLabel>{t("fromIdea.durationLabel")}</FieldLabel>
          <Input
            type="number"
            min={0.5}
            step={0.5}
            value={step.ideaDurationSec ? step.ideaDurationSec / 60 : ""}
            onChange={(e) =>
              step.setIdeaDurationSec(
                e.target.value ? Math.max(30, Math.round(Number(e.target.value) * 60)) : null,
              )
            }
          />
        </Field>
        <Field className="w-40">
          <FieldLabel>{t("scriptLanguageLabel")}</FieldLabel>
          <Select
            value={step.scriptLanguage}
            onValueChange={(value) => step.setScriptLanguage(value as ScriptLanguage)}
          >
            <SelectTrigger>
              <SelectValue>
                {() => (step.scriptLanguage === "vi" ? t("scriptLanguageVi") : t("scriptLanguageEn"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">{t("scriptLanguageVi")}</SelectItem>
              <SelectItem value="en">{t("scriptLanguageEn")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <SkillSelectField step={step} className="w-56" />
      </div>

      <div>
        <Button
          type="button"
          onClick={() => void step.writeFromIdea()}
          disabled={!step.idea.trim() || step.writing}
        >
          {step.writing && <Spinner />}
          {t("fromIdea.writeButton")}
        </Button>
        {step.writing && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t("fromIdea.writingHint")}</p>
        )}
      </div>
    </div>
  );
}
