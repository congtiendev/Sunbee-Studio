import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslations } from "@/i18n";
import { SCRIPT_SOURCES, type ScriptSourceKey } from "./sources/registry";

/** The "where does the script come from" radio row. */
export default function ScriptSourcePicker({
  value,
  onChange,
  disabled,
}: {
  value: ScriptSourceKey;
  onChange: (key: ScriptSourceKey) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("videoStudio.script");
  return (
    <RadioGroup
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as ScriptSourceKey)}
      className="flex flex-wrap items-center gap-6"
    >
      {SCRIPT_SOURCES.map((s) => (
        <Field key={s.key} orientation="horizontal" className="w-auto gap-2.5">
          <RadioGroupItem id={`script-source-${s.key}`} value={s.key} />
          <Label htmlFor={`script-source-${s.key}`} className="cursor-pointer">
            {t(s.labelKey)}
          </Label>
        </Field>
      ))}
    </RadioGroup>
  );
}
