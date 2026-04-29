import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillEntry,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import {
  readInstalledSkillTargets,
  readPaperclipRuntimeSkillEntries,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";
import { resolveManagedCodexHomeDir } from "./codex-home.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function parseObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveCodexSkillsHome(
  ctx: AdapterSkillContext,
): string {
  const env = parseObject(ctx.config.env);
  const configuredCodexHome =
    typeof env.CODEX_HOME === "string" && env.CODEX_HOME.trim().length > 0
      ? path.resolve(env.CODEX_HOME.trim())
      : null;
  return path.join(
    configuredCodexHome ?? resolveManagedCodexHomeDir(process.env, ctx.companyId),
    "skills",
  );
}

async function buildCodexSkillSnapshot(
  ctx: AdapterSkillContext,
): Promise<AdapterSkillSnapshot> {
  const config = ctx.config;
  const availableEntries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  const availableByKey = new Map(availableEntries.map((entry) => [entry.key, entry]));
  const desiredSkills = resolvePaperclipDesiredSkillNames(config, availableEntries);
  const desiredSet = new Set(desiredSkills);
  const skillsHome = resolveCodexSkillsHome(ctx);
  const installed = await readInstalledSkillTargets(skillsHome);
  const entries: AdapterSkillEntry[] = availableEntries.map((entry) => {
    const desired = desiredSet.has(entry.key);
    const installedEntry = installed.get(entry.runtimeName) ?? null;
    const targetPath = path.join(skillsHome, entry.runtimeName);
    const isManagedLink = installedEntry?.targetPath === entry.source;
    const state = isManagedLink
      ? desired ? "installed" : "stale"
      : installedEntry ? "external" : desired ? "configured" : "available";
    const detail = isManagedLink
      ? "Linked into the effective CODEX_HOME/skills/ directory."
      : installedEntry
        ? "A non-Paperclip skill already exists at this CODEX_HOME/skills/ name."
        : desired
          ? "Will be linked into the effective CODEX_HOME/skills/ directory on the next run."
          : null;

    return {
      key: entry.key,
      runtimeName: entry.runtimeName,
      desired,
      managed: isManagedLink || !installedEntry,
      state,
      origin: entry.required ? "paperclip_required" : "company_managed",
      originLabel: entry.required ? "Required by Paperclip" : "Managed by Paperclip",
      readOnly: false,
      sourcePath: entry.source,
      targetPath,
      detail,
      required: Boolean(entry.required),
      requiredReason: entry.requiredReason ?? null,
    };
  });
  const warnings: string[] = [];

  for (const desiredSkill of desiredSkills) {
    if (availableByKey.has(desiredSkill)) continue;
    warnings.push(`Desired skill "${desiredSkill}" is not available from the Paperclip skills directory.`);
    entries.push({
      key: desiredSkill,
      runtimeName: null,
      desired: true,
      managed: true,
      state: "missing",
      origin: "external_unknown",
      originLabel: "External or unavailable",
      readOnly: false,
      sourcePath: null,
      targetPath: null,
      detail: "Paperclip cannot find this skill in the local runtime skills directory.",
    });
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));

  return {
    adapterType: "codex_local",
    supported: true,
    mode: "ephemeral",
    desiredSkills,
    entries,
    warnings,
  };
}

export async function listCodexSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  return buildCodexSkillSnapshot(ctx);
}

export async function syncCodexSkills(
  ctx: AdapterSkillContext,
  _desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  return buildCodexSkillSnapshot(ctx);
}

export function resolveCodexDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: Array<{ key: string; required?: boolean }>,
) {
  return resolvePaperclipDesiredSkillNames(config, availableEntries);
}
