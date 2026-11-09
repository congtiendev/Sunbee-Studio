import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { CheckIcon, ClaudeIcon, GptIcon, XIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type { NamedApiKey } from "@shared/types";
import { useEffect, useState } from "react";

type Provider = "openai" | "anthropic";
type TestStatus = "idle" | "testing" | "ok" | "error";

function maskKey(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export default function ApiKeysSection() {
  const t = useTranslations("settings.apiKeys");
  const tCommon = useTranslations("common");

  const [activeProvider, setActiveProvider] = useState<Provider>("openai");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- OpenAI: single key ---
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [savedOpenaiApiKey, setSavedOpenaiApiKey] = useState("");
  const [openaiEditing, setOpenaiEditing] = useState(false);
  const [openaiTestStatus, setOpenaiTestStatus] = useState<TestStatus>("idle");
  const [openaiTestError, setOpenaiTestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // --- Anthropic: multiple named keys, switch which one is active ---
  const [anthropicKeys, setAnthropicKeys] = useState<NamedApiKey[]>([]);
  const [activeAnthropicKeyId, setActiveAnthropicKeyId] = useState<
    string | undefined
  >(undefined);
  const [addingKey, setAddingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyTestStatus, setNewKeyTestStatus] = useState<TestStatus>("idle");
  const [newKeyTestError, setNewKeyTestError] = useState<string | null>(null);
  const [savingNewKey, setSavingNewKey] = useState(false);
  const [keyActionError, setKeyActionError] = useState<string | null>(null);
  const [keyActionPendingId, setKeyActionPendingId] = useState<string | null>(
    null,
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const settings = await apiClient.settings.get();
        if (!active) return;
        setOpenaiApiKey(settings.openaiApiKey ?? "");
        setSavedOpenaiApiKey(settings.openaiApiKey ?? "");
        setOpenaiEditing(!settings.openaiApiKey);
        setAnthropicKeys(settings.anthropicApiKeys ?? []);
        setActiveAnthropicKeyId(settings.activeAnthropicApiKeyId);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  // --- OpenAI handlers ---
  const handleOpenaiKeyChange = (value: string) => {
    setOpenaiApiKey(value);
    setOpenaiTestStatus("idle");
    setOpenaiTestError(null);
  };

  const handleOpenaiTest = async () => {
    setOpenaiTestStatus("testing");
    setOpenaiTestError(null);
    try {
      const result = await apiClient.settings.testKey({
        provider: "openai",
        apiKey: openaiApiKey,
      });
      if (result.ok) {
        setOpenaiTestStatus("ok");
      } else {
        setOpenaiTestStatus("error");
        setOpenaiTestError(result.error);
      }
    } catch (err) {
      setOpenaiTestStatus("error");
      setOpenaiTestError(err instanceof Error ? err.message : String(err));
    }
  };

  const openaiNeedsTest =
    openaiApiKey !== "" &&
    openaiApiKey !== savedOpenaiApiKey &&
    openaiTestStatus !== "ok";

  const handleSaveOpenai = async () => {
    if (openaiNeedsTest) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiClient.settings.set({ openaiApiKey });
      setSavedOpenaiApiKey(openaiApiKey);
      setOpenaiEditing(!openaiApiKey);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOpenaiEdit = () => {
    handleOpenaiKeyChange(savedOpenaiApiKey);
    setOpenaiEditing(false);
  };

  // --- Anthropic handlers ---
  const resetNewKeyForm = () => {
    setAddingKey(false);
    setNewKeyName("");
    setNewKeyValue("");
    setNewKeyTestStatus("idle");
    setNewKeyTestError(null);
  };

  const handleNewKeyValueChange = (value: string) => {
    setNewKeyValue(value);
    setNewKeyTestStatus("idle");
    setNewKeyTestError(null);
  };

  const handleTestNewKey = async () => {
    setNewKeyTestStatus("testing");
    setNewKeyTestError(null);
    try {
      const result = await apiClient.settings.testKey({
        provider: "anthropic",
        apiKey: newKeyValue,
      });
      if (result.ok) {
        setNewKeyTestStatus("ok");
      } else {
        setNewKeyTestStatus("error");
        setNewKeyTestError(result.error);
      }
    } catch (err) {
      setNewKeyTestStatus("error");
      setNewKeyTestError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddKey = async () => {
    if (!newKeyName.trim() || newKeyTestStatus !== "ok") return;
    setSavingNewKey(true);
    setKeyActionError(null);
    try {
      const settings = await apiClient.settings.addAnthropicKey({
        name: newKeyName.trim(),
        apiKey: newKeyValue,
      });
      setAnthropicKeys(settings.anthropicApiKeys ?? []);
      setActiveAnthropicKeyId(settings.activeAnthropicApiKeyId);
      resetNewKeyForm();
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingNewKey(false);
    }
  };

  const handleActivateKey = async (id: string) => {
    setKeyActionPendingId(id);
    setKeyActionError(null);
    try {
      const settings = await apiClient.settings.activateAnthropicKey(id);
      setAnthropicKeys(settings.anthropicApiKeys ?? []);
      setActiveAnthropicKeyId(settings.activeAnthropicApiKeyId);
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyActionPendingId(null);
    }
  };

  const startRename = (key: NamedApiKey) => {
    setRenamingId(key.id);
    setRenameValue(key.name);
    setKeyActionError(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameKey = async (id: string) => {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    setKeyActionError(null);
    try {
      const settings = await apiClient.settings.renameAnthropicKey(
        id,
        renameValue.trim(),
      );
      setAnthropicKeys(settings.anthropicApiKeys ?? []);
      setActiveAnthropicKeyId(settings.activeAnthropicApiKeyId);
      cancelRename();
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenameSaving(false);
    }
  };

  const handleRemoveKey = async (id: string) => {
    setKeyActionPendingId(id);
    setKeyActionError(null);
    try {
      const settings = await apiClient.settings.removeAnthropicKey(id);
      setAnthropicKeys(settings.anthropicApiKeys ?? []);
      setActiveAnthropicKeyId(settings.activeAnthropicApiKeyId);
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyActionPendingId(null);
    }
  };

  const renderOpenaiFields = () => {
    if (!openaiEditing && savedOpenaiApiKey) {
      return (
        <Field>
          <FieldLabel>{t("openaiLabel")}</FieldLabel>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-gray-800">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                {maskKey(savedOpenaiApiKey)}
              </span>
              <Badge variant="light" color="success">
                {t("connected")}
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenaiEditing(true)}
            >
              {t("editButton")}
            </Button>
          </div>
        </Field>
      );
    }

    return (
      <Field>
        <FieldLabel>{t("openaiLabel")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            type="password"
            value={openaiApiKey}
            onChange={(e) => handleOpenaiKeyChange(e.target.value)}
            placeholder="sk-..."
            disabled={loading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleOpenaiTest()}
            disabled={
              loading || !openaiApiKey || openaiTestStatus === "testing"
            }
          >
            {openaiTestStatus === "testing" && <Spinner />}
            {t("testButton")}
          </Button>
          {savedOpenaiApiKey && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelOpenaiEdit}
            >
              {t("cancelButton")}
            </Button>
          )}
        </div>

        {openaiTestStatus === "ok" && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            {t("testOk")}
          </p>
        )}
        {openaiTestStatus === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {openaiTestError}
          </p>
        )}
      </Field>
    );
  };

  const renderAnthropicKeys = () => (
    <div className="space-y-4">
      <FieldLabel>{t("anthropicLabel")}</FieldLabel>

      {keyActionError && (
        <Alert variant="destructive">
          <AlertDescription>{keyActionError}</AlertDescription>
        </Alert>
      )}

      {anthropicKeys.length > 0 && (
        <div className="space-y-2">
          {anthropicKeys.map((key) => {
            const isActive = key.id === activeAnthropicKeyId;
            const pending = keyActionPendingId === key.id;
            const isRenaming = renamingId === key.id;

            if (isRenaming) {
              return (
                <div
                  key={key.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-gray-800"
                >
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleRenameKey(key.id)}
                    disabled={!renameValue.trim() || renameSaving}
                  >
                    {renameSaving && <Spinner />}
                    {tCommon("confirm")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelRename}
                  >
                    {tCommon("cancel")}
                  </Button>
                </div>
              );
            }

            return (
              <div
                key={key.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-gray-800"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {key.name}
                  </span>
                  <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                    {maskKey(key.apiKey)}
                  </span>
                  {isActive && (
                    <Badge variant="light" color="success">
                      {t("activeBadge")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleActivateKey(key.id)}
                      disabled={pending}
                    >
                      {pending && <Spinner />}
                      {t("useButton")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => startRename(key)}
                  >
                    {t("renameButton")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRemoveKey(key.id)}
                    disabled={pending}
                  >
                    {tCommon("delete")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addingKey ? (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <Field>
            <FieldLabel>{t("keyNameLabel")}</FieldLabel>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t("keyNamePlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel>{t("anthropicLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Input
                type="password"
                value={newKeyValue}
                onChange={(e) => handleNewKeyValueChange(e.target.value)}
                placeholder="sk-ant-..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleTestNewKey()}
                disabled={!newKeyValue || newKeyTestStatus === "testing"}
              >
                {newKeyTestStatus === "testing" && <Spinner />}
                {t("testButton")}
              </Button>
            </div>
            {newKeyTestStatus === "ok" && (
              <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                {t("testOk")}
              </p>
            )}
            {newKeyTestStatus === "error" && (
              <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {newKeyTestError}
              </p>
            )}
          </Field>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleAddKey()}
              disabled={
                !newKeyName.trim() || newKeyTestStatus !== "ok" || savingNewKey
              }
            >
              {savingNewKey && <Spinner />}
              {t("addButton")}
            </Button>
            <Button type="button" variant="outline" onClick={resetNewKeyForm}>
              {t("cancelButton")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setAddingKey(true)}
        >
          {t("addKeyButton")}
        </Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        <Tabs
          value={activeProvider}
          onValueChange={(value) => setActiveProvider(value as Provider)}
        >
          <TabsList>
            <TabsTrigger value="openai" className="gap-1.5">
              <GptIcon className="size-4" />
              {t("providers.openai")}
            </TabsTrigger>
            <TabsTrigger value="anthropic" className="gap-1.5">
              <ClaudeIcon className="size-4" />
              {t("providers.anthropic")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="openai">{renderOpenaiFields()}</TabsContent>

          <TabsContent value="anthropic">{renderAnthropicKeys()}</TabsContent>
        </Tabs>

        {saved && (
          <Alert variant="success">
            <AlertDescription>{t("saved")}</AlertDescription>
          </Alert>
        )}

        {activeProvider === "openai" && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleSaveOpenai()}
              disabled={loading || saving || openaiNeedsTest}
            >
              {saving && <Spinner />}
              {tCommon("saveChanges")}
            </Button>

            {openaiNeedsTest && (
              <span className={cn("text-sm text-gray-500 dark:text-gray-400")}>
                {t("testRequired")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
