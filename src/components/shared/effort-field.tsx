import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslations } from "@/i18n";
import { InfoIcon } from "@/icons";

export type AiEffort = "low" | "medium" | "high";

/** Reasoning-effort select, shared by every place that picks an AI model (see ProviderModelFields). */
export default function EffortField({
  value,
  onChange,
  className = "w-40",
}: {
  value: AiEffort;
  onChange: (effort: AiEffort) => void;
  className?: string;
}) {
  const t = useTranslations("videoStudio.script");
  const labels: Record<AiEffort, string> = {
    low: t("effortLow"),
    medium: t("effortMedium"),
    high: t("effortHigh"),
  };

  return (
    <Field className={className}>
      <FieldLabel className="items-center">
        {t("effortLabel")}
        <Tooltip>
          <TooltipTrigger
            type="button"
            aria-label={t("effortHint")}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <InfoIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{t("effortHint")}</TooltipContent>
        </Tooltip>
      </FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as AiEffort)}>
        <SelectTrigger>
          <SelectValue>{() => labels[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">{labels.low}</SelectItem>
          <SelectItem value="medium">{labels.medium}</SelectItem>
          <SelectItem value="high">{labels.high}</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
