import OpenAI from "openai";

export type ApiKeyProvider = "openai" | "anthropic";

async function validateOpenaiKey(apiKey: string): Promise<string | null> {
  try {
    await new OpenAI({ apiKey }).models.list();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function validateAnthropicKey(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return body?.error?.message ?? `Anthropic trả về lỗi (${res.status}).`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function validateApiKey(
  provider: ApiKeyProvider,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!apiKey.trim()) return { ok: false, error: "Vui lòng nhập API key." };

  const error =
    provider === "openai"
      ? await validateOpenaiKey(apiKey)
      : await validateAnthropicKey(apiKey);

  return error ? { ok: false, error } : { ok: true };
}
