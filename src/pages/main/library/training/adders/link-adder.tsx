import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { LinkIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { useState } from "react";
import AddStatusList from "./add-status-list";
import {
  MIN_SCRIPT_CHARS,
  errorMessage,
  type AddStatus,
  type SourceAdderProps,
} from "./types";

/** Paste video links (one per line); each one's script is fetched like in the Script step. */
export default function LinkAdder({ ai, onAdded, disabled }: SourceAdderProps) {
  const t = useTranslations("training.adders.link");
  const [text, setText] = useState("");
  const [items, setItems] = useState<{ label: string; status: AddStatus }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);

  const urls = [
    ...new Set(
      text
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const setStatus = (index: number, status: AddStatus) =>
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status } : item)),
    );

  const fetchAll = async () => {
    if (urls.length === 0) return;
    setBusy(true);
    setItems(urls.map((url) => ({ label: url, status: { state: "waiting" } })));
    // One at a time: each fetch may download and transcribe a whole video.
    for (const [index, url] of urls.entries()) {
      setStatus(index, { state: "working" });
      try {
        const result = await apiClient.script.fetchTranscript({
          url,
          useAi: true,
          provider: ai.provider,
          model: ai.model,
          language: "vi",
        });
        const script = result.scriptText.trim();
        if (!result.versionId || script.length < MIN_SCRIPT_CHARS) {
          setStatus(index, { state: "error", message: t("tooShort") });
          continue;
        }
        onAdded({
          kind: "link",
          id: result.versionId,
          title: url,
          group: "",
          excerpt: script.slice(0, 200),
          charCount: script.length,
          badges: ["new"],
        });
        setStatus(index, { state: "done" });
      } catch (err) {
        setStatus(index, { state: "error", message: errorMessage(err) });
      }
    }
    setText("");
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("placeholder")}
        rows={3}
        disabled={busy || disabled}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void fetchAll()}
          disabled={busy || disabled || urls.length === 0}
        >
          <LinkIcon className="size-4" />
          {busy ? t("fetching") : t("fetch", { count: urls.length })}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("hint")}
        </span>
      </div>
      <AddStatusList items={items} />
    </div>
  );
}
