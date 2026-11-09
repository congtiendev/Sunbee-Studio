import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "@/i18n";
import ProviderModelFields from "../provider-model-fields";
import type { ScriptLanguage } from "../use-script-step";
import type { ScriptSourcePanelProps } from "./registry";

/** Source "link": captions via yt-dlp, cleaned (or transcribed when missing) by AI. */
export default function LinkPanel({ step }: ScriptSourcePanelProps) {
  const t = useTranslations("videoStudio.script");
  const hasAnyKey =
    step.availableProviders.openai || step.availableProviders.claude;

  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel>{t("urlLabel")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            value={step.url}
            onChange={(e) => step.setUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
          />
          <Button
            type="button"
            onClick={() => void step.fetchFromLink()}
            disabled={!step.url || step.fetching}
          >
            {step.fetching && <Spinner />}
            {t("fetchButton")}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {step.fetching
            ? t(step.linkUseAi ? "link.fetchingAiHint" : "fetchingHint")
            : t(step.linkUseAi ? "link.aiHint" : "linkCaptionHint")}
        </p>
      </Field>

      {/* Công tắc nằm chung hàng với lựa chọn AI: tắt thì cả hàng chỉ còn công tắc. */}
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-auto">
          <FieldLabel htmlFor="link-use-ai">{t("link.useAi")}</FieldLabel>
          <div className="flex h-11 items-center">
            <Switch
              id="link-use-ai"
              checked={step.linkUseAi}
              onCheckedChange={step.setLinkUseAi}
            />
          </div>
        </Field>
        {step.linkUseAi && (
          <>
            <ProviderModelFields
              providerLabel={t("link.providerLabel")}
              provider={step.describeProvider}
              onProviderChange={step.changeDescribeProvider}
              model={step.describeModel}
              onModelChange={step.setDescribeModel}
              availableProviders={step.availableProviders}
            />
            <Field className="w-40">
              <FieldLabel>{t("scriptLanguageLabel")}</FieldLabel>
              <Select
                value={step.scriptLanguage}
                onValueChange={(value) =>
                  step.setScriptLanguage(value as ScriptLanguage)
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {() =>
                      step.scriptLanguage === "vi"
                        ? t("scriptLanguageVi")
                        : t("scriptLanguageEn")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vi">{t("scriptLanguageVi")}</SelectItem>
                  <SelectItem value="en">{t("scriptLanguageEn")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </div>

      {step.linkUseAi && (
        <>
          <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("link.whisperHint")}
          </p>
          {!hasAnyKey && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("link.noKeyHint")}
            </p>
          )}
        </>
      )}

      {step.linkOrigin && !step.fetching && (
        <Alert
          variant={
            step.linkOrigin === "captions" && step.linkUseAi
              ? "warning"
              : "info"
          }
        >
          <AlertDescription>
            {t(
              step.linkOrigin === "captions" && step.linkUseAi
                ? "link.origin.captionsAiFailed"
                : `link.origin.${step.linkOrigin}`,
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
