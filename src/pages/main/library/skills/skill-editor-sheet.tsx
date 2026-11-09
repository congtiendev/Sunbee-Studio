import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import type { DocumentSummary, ScriptAnalysisSummary, SkillDetail } from "@shared/types";
import { useEffect, useState } from "react";
import { useForm, type FieldError as FormFieldError } from "react-hook-form";
import DocumentPicker from "../documents/document-picker";
import ExamplesPicker from "./examples-picker";
import { EMPTY_SKILL_FORM, skillFormSchema, splitTags, type SkillFormData } from "./schema";

const SECTION_TITLE = "text-sm font-semibold text-gray-800 dark:text-white/90";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toForm(skill: SkillDetail): SkillFormData {
  return {
    name: skill.name,
    description: skill.description ?? "",
    genre: skill.genre,
    styleTags: skill.styleTags.join(", "),
    toneDescription: skill.toneDescription,
    avgShotLengthSec: Number(skill.pacing.avgShotLengthSec.toFixed(1)),
    cutsPerMinute: Number(skill.pacing.cutsPerMinute.toFixed(1)),
    instructions: skill.instructions ?? "",
  };
}

interface SkillEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create a new skill. */
  skillId: string | null;
  onSaved: (skill: SkillDetail) => void;
}

export default function SkillEditorSheet({ open, onOpenChange, skillId, onSaved }: SkillEditorSheetProps) {
  const t = useTranslations("videoStudio.skills");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader className="pe-10">
          <SheetTitle>{skillId ? t("editor.editTitle") : t("editor.createTitle")}</SheetTitle>
          <SheetDescription>{t("editor.description")}</SheetDescription>
        </SheetHeader>
        {/* Mounted per open/skill so every open starts from fresh server data. */}
        {open && (
          <SkillEditorBody
            key={skillId ?? "new"}
            skillId={skillId}
            onCancel={() => onOpenChange(false)}
            onSaved={(skill) => {
              onSaved(skill);
              onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SkillEditorBody({
  skillId,
  onCancel,
  onSaved,
}: {
  skillId: string | null;
  onCancel: () => void;
  onSaved: (skill: SkillDetail) => void;
}) {
  const t = useTranslations("videoStudio.skills");
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(skillId !== null);
  const [analyzed, setAnalyzed] = useState<ScriptAnalysisSummary[]>([]);
  const [loadingAnalyzed, setLoadingAnalyzed] = useState(true);
  const [exampleIds, setExampleIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SkillFormData>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: EMPTY_SKILL_FORM,
    mode: "onTouched",
  });

  useEffect(() => {
    let active = true;
    apiClient.script
      .analyzed()
      .then((rows) => {
        if (active) setAnalyzed(rows);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadingAnalyzed(false);
      });
    apiClient.documents
      .list()
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadingDocuments(false);
      });
    if (skillId) {
      apiClient.templates
        .get(skillId)
        .then((skill) => {
          if (!active) return;
          setDetail(skill);
          setExampleIds(skill.examples.map((example) => example.id));
          setDocumentIds(skill.documents.map((doc) => doc.id));
          reset(toForm(skill));
        })
        .catch((err) => {
          if (active) setError(errorMessage(err));
        })
        .finally(() => {
          if (active) setLoadingDetail(false);
        });
    }
    return () => {
      active = false;
    };
  }, [skillId, reset]);

  const onSubmit = async (data: SkillFormData) => {
    setError(null);
    const fields = {
      name: data.name.trim(),
      description: data.description.trim(),
      genre: data.genre.trim(),
      styleTags: splitTags(data.styleTags),
      toneDescription: data.toneDescription.trim(),
      pacing: { avgShotLengthSec: data.avgShotLengthSec, cutsPerMinute: data.cutsPerMinute },
      instructions: data.instructions,
    };
    try {
      const id =
        skillId ??
        (await apiClient.templates.save({ ...fields, resourceInventory: {} })).id;
      onSaved(await apiClient.templates.update(id, { ...fields, exampleIds, documentIds }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Examples the skill already has but that aren't in the picker list (e.g. imported, video-less).
  const pickerOptions = [
    ...(detail?.examples ?? []).filter((example) => !analyzed.some((a) => a.id === example.id)),
    ...analyzed,
  ];

  const translatedError = (fieldError?: FormFieldError) =>
    fieldError?.message ? [{ message: t(`form.${fieldError.message}`) }] : undefined;

  if (loadingDetail) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="-mx-6 flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-6 overflow-y-auto px-6 custom-scrollbar">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {detail?.origin === "anthropic" && (
          <Alert variant="info">
            <AlertDescription>{t("editor.agentSkillHint")}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel>{t("form.name")}</FieldLabel>
            <Input
              {...register("name")}
              placeholder={t("form.namePlaceholder")}
              aria-invalid={errors.name ? "true" : undefined}
            />
            <FieldError errors={translatedError(errors.name)} />
          </Field>
          <Field>
            <FieldLabel>{t("form.description")}</FieldLabel>
            <Input {...register("description")} placeholder={t("form.descriptionPlaceholder")} />
          </Field>
        </section>

        <section className="space-y-4">
          <h3 className={SECTION_TITLE}>{t("form.styleSection")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("form.genre")}</FieldLabel>
              <Input {...register("genre")} placeholder={t("form.genrePlaceholder")} />
            </Field>
            <Field>
              <FieldLabel>{t("form.styleTags")}</FieldLabel>
              <Input {...register("styleTags")} placeholder={t("form.styleTagsPlaceholder")} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("form.tone")}</FieldLabel>
            <Input {...register("toneDescription")} placeholder={t("form.tonePlaceholder")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.avgShotLengthSec)}>
              <FieldLabel>{t("form.avgShotLength")}</FieldLabel>
              <Input
                type="number"
                min={0}
                step={0.1}
                {...register("avgShotLengthSec", { valueAsNumber: true })}
              />
              <FieldError errors={translatedError(errors.avgShotLengthSec)} />
            </Field>
            <Field data-invalid={Boolean(errors.cutsPerMinute)}>
              <FieldLabel>{t("form.cutsPerMinute")}</FieldLabel>
              <Input
                type="number"
                min={0}
                step={0.1}
                {...register("cutsPerMinute", { valueAsNumber: true })}
              />
              <FieldError errors={translatedError(errors.cutsPerMinute)} />
            </Field>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("form.styleHint")}</p>
        </section>

        <section className="space-y-2">
          <Field>
            <FieldLabel className={SECTION_TITLE}>{t("form.instructions")}</FieldLabel>
            <FieldDescription>{t("form.instructionsHint")}</FieldDescription>
            <Textarea
              {...register("instructions")}
              rows={10}
              className="font-mono text-xs"
              placeholder={t("form.instructionsPlaceholder")}
            />
          </Field>
        </section>

        <section className="space-y-3 pb-2">
          <div className="flex items-center gap-2">
            <h3 className={SECTION_TITLE}>{t("examples.title")}</h3>
            <Badge variant="light" color="gray" size="sm">
              {exampleIds.length}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("examples.hint")}</p>
          <ExamplesPicker
            options={pickerOptions}
            loading={loadingAnalyzed}
            selected={exampleIds}
            onChange={setExampleIds}
          />
        </section>

        <section className="space-y-3 pb-2">
          <div className="flex items-center gap-2">
            <h3 className={SECTION_TITLE}>{t("documents.title")}</h3>
            <Badge variant="light" color="gray" size="sm">
              {documentIds.length}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("documents.hint")}</p>
          <DocumentPicker
            documents={documents}
            loading={loadingDocuments}
            selected={documentIds}
            onChange={setDocumentIds}
          />
        </section>
      </div>

      <SheetFooter className="border-t border-gray-100 px-6 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("editor.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t("editor.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
