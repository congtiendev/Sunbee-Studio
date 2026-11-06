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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { CheckIcon, CopyIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { useEffect, useState } from "react";

export default function McpSection() {
  const t = useTranslations("settings.mcp");

  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const settings = await apiClient.settings.get();
        if (!active) return;
        setEnabled(settings.mcpEnabled ?? false);
        setToken(settings.mcpToken ?? "");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleEnable = async () => {
    setToggling(true);
    setError(null);
    try {
      const result = await apiClient.settings.enableMcp();
      setEnabled(true);
      setToken(result.mcpToken ?? "");
      setUrl(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(false);
    }
  };

  const handleDisable = async () => {
    setToggling(true);
    setError(null);
    try {
      await apiClient.settings.set({ mcpEnabled: false });
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const mcpUrl = url || "http://127.0.0.1:4317/mcp";
  const mcpJsonSnippet = JSON.stringify(
    {
      mcpServers: {
        sunbee: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
  const cliSnippet = `claude mcp add --transport http sunbee ${mcpUrl} --header "Authorization: Bearer ${token}"`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field orientation="horizontal" className="w-auto gap-2.5">
          <Switch
            id="mcp-enabled"
            checked={enabled}
            disabled={loading || toggling}
            onCheckedChange={(checked) =>
              void (checked ? handleEnable() : handleDisable())
            }
          />
          <Label htmlFor="mcp-enabled" className="cursor-pointer">
            {enabled ? t("enabled") : t("disabled")}
          </Label>
          {toggling && <Spinner />}
        </Field>

        {enabled && token && (
          <>
            <Field>
              <FieldLabel>{t("tokenLabel")}</FieldLabel>
              <InputGroup className="overflow-hidden">
                <InputGroupInput type="password" value={token} readOnly />
                <InputGroupAddon
                  align="inline-end"
                  className="self-stretch border-s border-gray-200 p-0 dark:border-gray-800"
                >
                  <button
                    type="button"
                    onClick={() => void handleCopy(token)}
                    className="flex h-full cursor-pointer items-center gap-1.5 rounded-e-[10px] px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-hidden dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="size-4 text-green-500" />
                        <span className="text-green-500">{t("copied")}</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="size-4 text-gray-500 dark:text-gray-400" />
                        <span>{t("copy")}</span>
                      </>
                    )}
                  </button>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleEnable()}
              disabled={toggling}
            >
              {t("regenerate")}
            </Button>

            <Field>
              <FieldLabel>{t("snippetLabel")}</FieldLabel>
              <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">
                {mcpJsonSnippet}
              </pre>
              <pre className="overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">
                {cliSnippet}
              </pre>
            </Field>
          </>
        )}
      </CardContent>
    </Card>
  );
}
