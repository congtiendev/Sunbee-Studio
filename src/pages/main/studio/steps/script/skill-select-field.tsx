import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import type { ScriptSourceState } from "./source-state";
import { NO_TEMPLATE } from "./use-script-step";

/** Picks the skill (voice/style guide) applied when writing the script. */
export default function SkillSelectField({
  step,
  className,
}: {
  step: ScriptSourceState;
  className?: string;
}) {
  const t = useTranslations("videoStudio.script");
  if (step.styleTemplates.length === 0) return null;

  return (
    <Field className={className}>
      <FieldLabel>{t("styleTemplateLabel")}</FieldLabel>
      <Select
        value={step.selectedTemplateId}
        onValueChange={(value) => step.setSelectedTemplateId(value as string)}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("styleTemplatePlaceholder")}>
            {() =>
              step.selectedTemplateId === NO_TEMPLATE
                ? t("styleTemplateNone")
                : (step.styleTemplates.find((tpl) => tpl.id === step.selectedTemplateId)
                    ?.name ?? t("styleTemplatePlaceholder"))
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEMPLATE}>{t("styleTemplateNone")}</SelectItem>
          {step.styleTemplates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
