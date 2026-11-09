import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { ResearchSourceInfo } from "@shared/types";
import { useEffect, useState } from "react";

type TestState =
  | { status: "idle" | "testing" }
  | { status: "ok" }
  | { status: "error"; error: string };

/** One research source's key: test it, save it, or remove it. */
function SourceKeyRow({
  source,
  savedKey,
  onSaved,
}: {
  source: ResearchSourceInfo;
  savedKey: string;
  onSaved: (value: string) => Promise<void>;
}) {
  const t = useTranslations("settings.researchKeys");
  const [value, setValue] = useState(savedKey);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saving, setSaving] = useState(false);

  const changed = value.trim() !== savedKey;
  // A new key must pass "Test" before it can be saved; clearing needs no test.
  const canSave = changed && (!value.trim() || test.status === "ok") && !saving;

  const handleTest = async () => {
    setTest({ status: "testing" });
    const res = await apiClient.settings
      .testKey({ provider: source.key, apiKey: value.trim() })
      .catch((err: unknown) => ({ ok: false as const, error: String(err) }));
    setTest(res.ok ? { status: "ok" } : { status: "error", error: res.error });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaved(value.trim());
      setTest({ status: "idle" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field>
      <FieldLabel>{t("keyLabel", { source: source.label })}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setTest({ status: "idle" });
          }}
          placeholder={t("keyPlaceholder")}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleTest()}
          disabled={!value.trim() || test.status === "testing"}
        >
          {test.status === "testing" && <Spinner />}
          {t("test")}
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving && <Spinner />}
          {!value.trim() && savedKey ? t("remove") : t("save")}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {t("mediaTypes", { types: source.mediaTypes.join(", ") })}
        {source.keyUrl && (
          <>
            {" · "}
            <a
              href={source.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-500 underline underline-offset-2 hover:text-brand-600 dark:text-brand-400"
            >
              {t("getKey")}
            </a>
          </>
        )}
      </p>
      {t(`hints.${source.key}`, { defaultValue: "" }) && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {t(`hints.${source.key}`, { defaultValue: "" })}
        </p>
      )}
      {test.status === "ok" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {t("testOk")}
        </p>
      )}
      {test.status === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">{test.error}</p>
      )}
      {changed && value.trim() && test.status !== "ok" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("testFirst")}
        </p>
      )}
    </Field>
  );
}

export default function ResearchKeysSection() {
  const t = useTranslations("settings.researchKeys");
  const [sources, setSources] = useState<ResearchSourceInfo[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.settings.researchSources(),
      apiClient.settings.get(),
    ])
      .then(([sourceList, settings]) => {
        setSources(sourceList.filter((s) => s.requiresKey));
        setKeys(settings.researchApiKeys ?? {});
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoaded(true));
  }, []);

  const saveKey = async (sourceKey: string, value: string) => {
    try {
      const settings = await apiClient.settings.set({
        researchApiKeys: { [sourceKey]: value },
      });
      setKeys(settings.researchApiKeys ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!loaded && <Spinner />}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {sources.map((source) => (
          <SourceKeyRow
            key={source.key}
            source={source}
            savedKey={keys[source.key] ?? ""}
            onSaved={(value) => saveKey(source.key, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
