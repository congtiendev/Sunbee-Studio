import { apiClient } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Generating can take minutes the very first time (venv/pip setup) or on a slow local model. */
const SLOW_HINT_DELAY_MS = 5_000;

/** Shared state for "type text, hear it in one voice" — used by the card quick-preview and the page-level converter. */
export function useVoicePreview(profileId: string | undefined) {
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Revoke the previous object URL whenever a new one replaces it (or this unmounts).
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (previewUrl) void audioRef.current?.play();
  }, [previewUrl]);

  useEffect(() => {
    if (!generating) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [generating]);

  const generate = async () => {
    if (!profileId || !text.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const blob = await apiClient.voiceover.preview(profileId, text.trim());
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  return { text, setText, generating, slow, error, previewUrl, audioRef, generate };
}
