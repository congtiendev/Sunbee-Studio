import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import type { StyleTemplate } from "@shared/types";

export const NO_GRAPHICS_SKILL = "__none__";

/** Picks the type "image" skill whose graphics style is applied to every AI image generated in this step. */
export default function GraphicsSkillSelect({
  skills,
  value,
  onChange,
  className,
}: {
  skills: StyleTemplate[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations("videoStudio.assets");
  if (skills.length === 0) return null;

  return (
    <Field className={className}>
      <FieldLabel>{t("graphicsSkillLabel")}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as string)}>
        <SelectTrigger>
          <SelectValue placeholder={t("graphicsSkillPlaceholder")}>
            {() =>
              value === NO_GRAPHICS_SKILL
                ? t("graphicsSkillNone")
                : (skills.find((skill) => skill.id === value)?.name ?? t("graphicsSkillPlaceholder"))
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GRAPHICS_SKILL}>{t("graphicsSkillNone")}</SelectItem>
          {skills.map((skill) => (
            <SelectItem key={skill.id} value={skill.id}>
              {skill.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t("graphicsSkillHint")}</FieldDescription>
    </Field>
  );
}
