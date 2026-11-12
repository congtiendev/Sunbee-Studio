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
import AiSettingsFields from "@/components/shared/ai-settings-fields";
import { apiClient } from "@/lib/api-client";
import DocumentPicker from "@/pages/main/library/documents/document-picker";
import type { DocumentSummary } from "@shared/types";
import { useEffect, useState } from "react";
import SkillSelectField from "../skill-select-field";
import type { ScriptLanguage } from "../use-script-step";
import type { ScriptSourcePanelProps } from "./registry";

/** Matches the server cap in `sources/document.ts`. */
const MAX_SOURCE_DOCUMENTS = 5;

/** Source "document": the AI writes the script from the user's documents. */
export default function DocumentPanel({ step }: ScriptSourcePanelProps) {
  const t = useTranslations("videoStudio.script");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.documents
      .list()
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch(() => {
        // Non-critical: the picker shows its empty state with a link to the documents page.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel>{t("fromDocument.documentsLabel", { max: MAX_SOURCE_DOCUMENTS })}</FieldLabel>
        <DocumentPicker
          documents={documents}
          loading={loading}
          selected={step.sourceDocumentIds}
          onChange={step.setSourceDocumentIds}
          max={MAX_SOURCE_DOCUMENTS}
        />
      </Field>

      <Field>
        <FieldLabel>{t("fromDocument.briefLabel")}</FieldLabel>
        <Textarea
          rows={3}
          value={step.brief}
          onChange={(e) => step.setBrief(e.target.value)}
          placeholder={t("fromDocument.briefPlaceholder")}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-3">
        <AiSettingsFields
          providerLabel={t("fromDocument.providerLabel")}
          provider={step.describeProvider}
          onProviderChange={step.changeDescribeProvider}
          model={step.describeModel}
          onModelChange={step.setDescribeModel}
          availableProviders={step.availableProviders}
          effort={step.effort}
          onEffortChange={step.setEffort}
        />
        <Field className="w-36">
          <FieldLabel>{t("fromDocument.durationLabel")}</FieldLabel>
          <Input
            type="number"
            min={5}
            step={5}
            value={step.targetDurationSec ?? ""}
            onChange={(e) =>
              step.setTargetDurationSec(e.target.value ? Math.max(5, Number(e.target.value)) : null)
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
          onClick={() => void step.writeFromDocuments()}
          disabled={step.sourceDocumentIds.length === 0 || step.writing}
        >
          {step.writing && <Spinner />}
          {t("fromDocument.writeButton")}
        </Button>
        {step.writing && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t("fromDocument.writingHint")}
          </p>
        )}
      </div>
    </div>
  );
}
