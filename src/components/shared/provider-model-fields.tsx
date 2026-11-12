import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClaudeIcon, GptIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import {
  ANALYZE_MODELS,
  type AnalyzeProvider,
} from "@shared/script-cost-estimate";

/** Provider tabs + model select, shared by every place that picks an AI model. */
export default function ProviderModelFields({
  providerLabel,
  provider,
  onProviderChange,
  model,
  onModelChange,
  availableProviders,
}: {
  providerLabel: string;
  provider: AnalyzeProvider;
  onProviderChange: (provider: AnalyzeProvider) => void;
  model: string;
  onModelChange: (model: string) => void;
  availableProviders: Record<AnalyzeProvider, boolean>;
}) {
  const t = useTranslations("videoStudio.script");

  return (
    <>
      <Field className="w-auto">
        <FieldLabel>{providerLabel}</FieldLabel>
        <Tabs
          value={provider}
          onValueChange={(value) => onProviderChange(value as AnalyzeProvider)}
        >
          <TabsList>
            <TabsTrigger
              value="openai"
              className="gap-1.5"
              disabled={!availableProviders.openai}
            >
              <GptIcon className="size-4" />
              {t("providerOpenai")}
            </TabsTrigger>
            <TabsTrigger
              value="claude"
              className="gap-1.5"
              disabled={!availableProviders.claude}
            >
              <ClaudeIcon className="size-4" />
              {t("providerClaude")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Field>

      <Field className="w-56">
        <FieldLabel>{t("modelLabel")}</FieldLabel>
        <Select
          value={model}
          onValueChange={(value) => onModelChange(value as string)}
        >
          <SelectTrigger>
            <SelectValue>
              {() =>
                ANALYZE_MODELS[provider].find((m) => m.id === model)?.label ??
                model
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ANALYZE_MODELS[provider].map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}
