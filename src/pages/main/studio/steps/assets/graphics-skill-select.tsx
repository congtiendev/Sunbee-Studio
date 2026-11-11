import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import type { StyleTemplate } from "@shared/types";

export const NO_GRAPHICS_SKILL = "__none__";

/**
 * Picks the type "image" skill whose graphics style is applied to every AI
 * image generated in this step. Laid out inline (label · select) for the
 * step's toolbar; the hint goes underneath at full width.
 */
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
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Label htmlFor="graphics-skill" className="shrink-0">
          {t("graphicsSkillLabel")}
        </Label>
        <Select value={value} onValueChange={(v) => onChange(v as string)}>
          <SelectTrigger id="graphics-skill" className="w-full sm:w-64">
            <SelectValue placeholder={t("graphicsSkillPlaceholder")}>
              {() =>
                value === NO_GRAPHICS_SKILL
                  ? t("graphicsSkillNone")
                  : (skills.find((skill) => skill.id === value)?.name ??
                    t("graphicsSkillPlaceholder"))
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
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t("graphicsSkillHint")}</p>
    </div>
  );
}
