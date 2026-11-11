import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { UploadIcon, XIcon } from "@/icons";
import { cn } from "@/utils";
import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";

export interface ImportTarget {
  /** The request's code (p1, p2…). */
  key: string;
  /** e.g. "p3 · Cảnh 4, 9". */
  label: string;
}

interface IncomingImage {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  /** When it was saved/zipped — the order ChatGPT made them in, for "assign in order". */
  order: number;
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/i;
/** "p12.png", "p12 - cảnh 4.png", "P12_final.webp" → "p12". */
const CODE = /^(p\d+)(?!\d)/i;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Images from the dropped/picked files, zips unpacked, oldest first. */
async function collectImages(files: File[]): Promise<Omit<IncomingImage, "id" | "previewUrl">[]> {
  const images: Omit<IncomingImage, "id" | "previewUrl">[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
      const zip = await JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files)) {
        const name = entry.name.split("/").pop() ?? entry.name;
        if (entry.dir || !IMAGE_FILE.test(name) || name.startsWith(".")) continue;
        const blob = await entry.async("blob");
        images.push({
          name,
          file: new File([blob], name, { type: blob.type || "image/png" }),
          order: entry.date.getTime(),
        });
      }
    } else if (file.type.startsWith("image/") || IMAGE_FILE.test(file.name)) {
      images.push({ name: file.name, file, order: file.lastModified });
    }
  }
  return images.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * Step ③ of the batch dialog: bring ChatGPT's images back. Files named after
 * their code are assigned straight away; the rest (ChatGPT's own download
 * names) wait here to be assigned by hand or in download order.
 */
export default function BatchImageImport({
  targets,
  imported,
  onAssign,
  onDone,
  disabled = false,
}: {
  targets: ImportTarget[];
  /** Codes that already have an image. */
  imported: ReadonlySet<string>;
  onAssign: (key: string, file: File) => Promise<void>;
  /** After a batch of assignments, e.g. to reload the step's picks once. */
  onDone: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("videoStudio.assets.batchPrompt");
  const [pending, setPending] = useState<IncomingImage[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<{ assigned: number; unmatched: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Free the previews still waiting when the dialog goes away.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl)), []);

  const missing = targets.filter((target) => !imported.has(target.key));
  const labelOf = new Map(targets.map((target) => [target.key, target.label]));

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      onDone();
    }
  };

  const drop = (ids: string[]) =>
    setPending((prev) =>
      prev.filter((img) => {
        if (!ids.includes(img.id)) return true;
        URL.revokeObjectURL(img.previewUrl);
        return false;
      }),
    );

  const intake = (files: File[]) =>
    run(async () => {
      const images = await collectImages(files);
      const known = new Set(targets.map((target) => target.key));
      let assigned = 0;
      const unmatched: IncomingImage[] = [];
      for (const image of images) {
        const key = CODE.exec(image.name)?.[1]?.toLowerCase();
        if (key && known.has(key)) {
          await onAssign(key, image.file);
          assigned++;
        } else {
          unmatched.push({ ...image, id: crypto.randomUUID(), previewUrl: URL.createObjectURL(image.file) });
        }
      }
      setPending((prev) => [...prev, ...unmatched].sort((a, b) => a.order - b.order));
      setSummary({ assigned, unmatched: unmatched.length });
    });

  const assignOne = (image: IncomingImage, key: string) =>
    run(async () => {
      await onAssign(key, image.file);
      drop([image.id]);
    });

  /** Pairs waiting images (oldest first) with the codes still missing an image (p1 first). */
  const assignInOrder = () =>
    run(async () => {
      const pairs = pending.slice(0, missing.length).map((image, i) => [image, missing[i]!.key] as const);
      const done: string[] = [];
      try {
        for (const [image, key] of pairs) {
          await onAssign(key, image.file);
          done.push(image.id);
        }
      } finally {
        drop(done);
      }
    });

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void intake(files);
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = [...e.dataTransfer.files];
          if (files.length && !disabled && !busy) void intake(files);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          dragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
            : "border-gray-300 hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-brand-500/50 dark:hover:bg-white/[0.02]",
        )}
      >
        {busy ? <Spinner /> : <UploadIcon className="size-5 text-gray-400 dark:text-gray-500" />}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("importButton")}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{t("importHint")}</span>
      </button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {t("importDone", { assigned: summary.assigned, unmatched: summary.unmatched })}
        </p>
      )}

      {pending.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-800 dark:text-white/90">
              {t("unmatchedTitle", { count: pending.length })}
            </p>
            <Button
              type="button"
              size="xs"
              className="ms-auto"
              disabled={busy || missing.length === 0}
              onClick={() => void assignInOrder()}
            >
              {t("assignInOrder")}
            </Button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {missing.length > 0
              ? t("assignInOrderHint", {
                  count: Math.min(pending.length, missing.length),
                  first: missing[0]!.key,
                })
              : t("nothingMissing")}
          </p>
          <ul className="space-y-2">
            {pending.map((image) => {
              const selected = choice[image.id] ?? "";
              return (
                <li key={image.id} className="flex items-center gap-2">
                  <img
                    src={image.previewUrl}
                    alt=""
                    className="size-11 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400" title={image.name}>
                      {image.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={selected}
                        onValueChange={(value) =>
                          setChoice((prev) => ({ ...prev, [image.id]: value as string }))
                        }
                      >
                        <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
                          <SelectValue placeholder={t("pickCode")}>
                            {() => (selected ? (labelOf.get(selected) ?? selected) : t("pickCode"))}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {/* Codes still without an image first. */}
                          {[...missing, ...targets.filter((target) => imported.has(target.key))].map((target) => (
                            <SelectItem key={target.key} value={target.key}>
                              {target.label}
                              {imported.has(target.key) ? " ✓" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy || !selected}
                        onClick={() => void assignOne(image, selected)}
                      >
                        {t("assign")}
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        title={t("discard")}
                        aria-label={t("discard")}
                        disabled={busy}
                        onClick={() => drop([image.id])}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
