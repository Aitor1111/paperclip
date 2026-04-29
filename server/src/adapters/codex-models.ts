import type { AdapterModel } from "./types.js";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";
import { readConfigFile } from "../config-file.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";
const OPENAI_MODELS_TIMEOUT_MS = 5000;
const OPENAI_MODELS_CACHE_TTL_MS = 60_000;

let cached: { keyFingerprint: string; expiresAt: number; models: AdapterModel[] } | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([
    ...models,
    ...codexFallbackModels,
  ]);
}

async function readCodexModelsCache(companyId?: string): Promise<AdapterModel[]> {
  const trimmedCompanyId = companyId?.trim();
  if (!trimmedCompanyId) return [];

  const cachePath = path.resolve(
    resolvePaperclipInstanceRoot(),
    "companies",
    trimmedCompanyId,
    "codex-home",
    "models_cache.json",
  );

  try {
    const payload = JSON.parse(await readFile(cachePath, "utf8")) as { models?: unknown };
    const entries = Array.isArray(payload.models) ? payload.models : [];
    const models: AdapterModel[] = [];
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as { slug?: unknown; display_name?: unknown; visibility?: unknown };
      if (typeof record.slug !== "string" || record.slug.trim().length === 0) continue;
      if (record.visibility === "hidden") continue;
      models.push({
        id: record.slug,
        label: typeof record.display_name === "string" && record.display_name.trim()
          ? record.display_name
          : record.slug,
      });
    }
    return dedupeModels(models);
  } catch {
    return [];
  }
}

function resolveOpenAiApiKey(): string | null {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;

  const config = readConfigFile();
  if (config?.llm?.provider !== "openai") return null;
  const configKey = config.llm.apiKey?.trim();
  return configKey && configKey.length > 0 ? configKey : null;
}

async function fetchOpenAiModels(apiKey: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models: AdapterModel[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || id.trim().length === 0) continue;
      models.push({ id, label: id });
    }
    return dedupeModels(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listCodexModels(ctx: { companyId?: string } = {}): Promise<AdapterModel[]> {
  const cacheModels = await readCodexModelsCache(ctx.companyId);
  const apiKey = resolveOpenAiApiKey();
  const fallback = dedupeModels(codexFallbackModels);
  if (!apiKey) return mergedWithFallback(cacheModels);

  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (cached && cached.keyFingerprint === keyFingerprint && cached.expiresAt > now) {
    return cacheModels.length > 0
      ? mergedWithFallback([...cacheModels, ...cached.models])
      : cached.models;
  }

  const fetched = await fetchOpenAiModels(apiKey);
  if (fetched.length > 0) {
    const merged = mergedWithFallback([...cacheModels, ...fetched]);
    cached = {
      keyFingerprint,
      expiresAt: now + OPENAI_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (cached && cached.keyFingerprint === keyFingerprint && cached.models.length > 0) {
    return cacheModels.length > 0
      ? mergedWithFallback([...cacheModels, ...cached.models])
      : cached.models;
  }

  return mergedWithFallback(cacheModels);
}

export function resetCodexModelsCacheForTests() {
  cached = null;
}
