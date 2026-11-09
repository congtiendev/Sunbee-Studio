import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import DocumentPicker from "@/pages/main/video-studio/documents/document-picker";
import type { DocumentSummary, ScriptAnalysisSummary } from "@shared/types";
import { useEffect, useState } from "react";
import ProviderModelFields from "../provider-model-fields";
import type { ScriptLanguage } from "../use-script-step";
import type { ScriptSourcePanelProps } from "./registry";

/** Matches the server cap in `sources/template.ts`. */
const MAX_TEMPLATE_DOCUMENTS = 3;

/** Source "template": reuse an analyzed video's structure, pacing and voice for a new topic. */
export default function TemplatePanel({ step }: ScriptSourcePanelProps) {
  const t = useTranslations("videoStudio.script");
  const [templates, setTemplates] = useState<ScriptAnalysisSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.script.analyzed(), apiClient.documents.list()])
      .then(([analyzed, docs]) => {
        if (!active) return;
        // A version of the current video can't be its own template.
        setTemplates(analyzed.filter((version) => version.videoId !== step.videoId));
        setDocuments(docs);
      })
      .catch(() => {
        // Non-critical: the pickers show their empty states.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [step.videoId]);

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel>{t("fromTemplate.templateLabel")}</FieldLabel>
        <FieldDescription>{t("fromTemplate.templateHint")}</FieldDescription>
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("fromTemplate.noTemplates")}</p>
        ) : (
          <div
            role="radiogroup"
            className="grid max-h-80 gap-2 overflow-y-auto pe-1 custom-scrollbar md:grid-cols-2"
          >
            {templates.map((template) => {
              const selected = template.id === step.templateVersionId;
              return (
                <button
                  key={template.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => step.setTemplateVersionId(template.id)}
                  className={cn(
                    "rounded-xl border p-3 text-start transition-colors",
                    selected
                      ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {template.videoName ?? t("fromTemplate.importedExample")}
                    </span>
                    {template.approved && (
                      <Badge variant="light" color="success" size="sm">
                        {t("approve.approvedBadge")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("history.sceneCount", { count: template.sceneCount })}
                    {template.genre ? ` · ${template.genre}` : ""}
                    {` · ${new Date(template.createdAt).toLocaleDateString()}`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                    {template.scriptExcerpt}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel>{t("fromTemplate.topicLabel")}</FieldLabel>
        <Textarea
          rows={3}
          value={step.topic}
          onChange={(e) => step.setTopic(e.target.value)}
          placeholder={t("fromTemplate.topicPlaceholder")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("fromTemplate.documentsLabel", { max: MAX_TEMPLATE_DOCUMENTS })}</FieldLabel>
        <DocumentPicker
          documents={documents}
          loading={loading}
          selected={step.templateDocumentIds}
          onChange={step.setTemplateDocumentIds}
          max={MAX_TEMPLATE_DOCUMENTS}
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
          <FieldLabel>{t("fromDocument.durationLabel")}</FieldLabel>
          <Input
            type="number"
            min={5}
            step={5}
            placeholder={t("fromTemplate.durationSame")}
            value={step.templateDurationSec ?? ""}
            onChange={(e) =>
              step.setTemplateDurationSec(e.target.value ? Math.max(5, Number(e.target.value)) : null)
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
      </div>
      <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{t("fromTemplate.resultHint")}</p>

      <div>
        <Button
          type="button"
          onClick={() => void step.writeFromTemplate()}
          disabled={!step.templateVersionId || !step.topic.trim() || step.writing}
        >
          {step.writing && <Spinner />}
          {t("fromTemplate.writeButton")}
        </Button>
        {step.writing && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t("fromTemplate.writingHint")}
          </p>
        )}
      </div>
    </div>
  );
}
