import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import { NO_TEMPLATE, type ScriptStepState } from "./use-script-step";

/** Picks the type "editing" skill (shot/cut/pacing methodology) applied when breaking the script into scenes — independent of the writing skill. */
export default function EditingSkillSelect({
  step,
  className,
}: {
  step: ScriptStepState;
  className?: string;
}) {
  const t = useTranslations("videoStudio.script");
  if (step.editingStyleTemplates.length === 0) return null;

  return (
    <Field className={className}>
      <FieldLabel>{t("editingStyleTemplateLabel")}</FieldLabel>
      <Select
        value={step.selectedEditingStyleId}
        onValueChange={(value) => step.setSelectedEditingStyleId(value as string)}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("editingStyleTemplatePlaceholder")}>
            {() =>
              step.selectedEditingStyleId === NO_TEMPLATE
                ? t("editingStyleTemplateNone")
                : (step.editingStyleTemplates.find(
                    (tpl) => tpl.id === step.selectedEditingStyleId,
                  )?.name ?? t("editingStyleTemplatePlaceholder"))
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEMPLATE}>{t("editingStyleTemplateNone")}</SelectItem>
          {step.editingStyleTemplates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t("editingStyleTemplateHint")}</FieldDescription>
    </Field>
  );
}
