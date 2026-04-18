import { exec } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type PermissionMode = "default" | "acceptEdits" | "auto" | "plan" | "dontAsk" | "bypassPermissions";

export interface LaunchOptions {
  agentName: string;
  skillsDir: string;
  instructionsDir: string;
  agentSkillsDirs?: string[];
  initialPrompt?: string;
  systemPromptFile?: string;
  sessionId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
}

export type TerminalApp = "iterm2" | "terminal";

/**
 * Strip characters that are unsafe for a shell --name value.
 */
function sanitizeName(value: string): string {
  return value.replace(/"/g, "");
}

/**
 * Build the `claude` CLI command arguments from the given options.
 * Returns the argument list and any temp files created.
 */
export function buildClaudeArgs(opts: LaunchOptions): string[] {
  const args: string[] = [];

  args.push("--add-dir", opts.skillsDir);
  args.push("--add-dir", opts.instructionsDir);

  // Add agent-specific skill directories so Claude can discover them
  if (opts.agentSkillsDirs?.length) {
    for (const skillDir of opts.agentSkillsDirs) {
      args.push("--add-dir", skillDir);
    }
  }

  // Inject agent instructions into system prompt (replicates headless adapter behavior)
  if (opts.systemPromptFile) {
    args.push("--append-system-prompt-file", opts.systemPromptFile);
  }

  const safeName = sanitizeName(opts.agentName);
  args.push("--name", `Meeting: ${safeName}`);

  if (opts.permissionMode) {
    args.push("--permission-mode", opts.permissionMode);
  }

  if (opts.allowedTools?.length) {
    for (const tool of opts.allowedTools) {
      args.push("--allowedTools", tool);
    }
  }

  if (opts.sessionId) {
    args.push("--resume", opts.sessionId);
  }

  return args;
}

/**
 * Write a self-contained shell script that runs the claude command.
 * This avoids AppleScript/shell escaping issues with long commands by keeping
 * the command in a file rather than passing it inline.
 */
function writelaunchScript(opts: LaunchOptions): string {
  const tempDir = join(tmpdir(), "paperclip-meet");
  mkdirSync(tempDir, { recursive: true });
  const scriptPath = join(tempDir, `launch-${randomUUID()}.sh`);

  const args = buildClaudeArgs(opts);

  // Build the script content with properly quoted arguments
  const lines: string[] = [
    "#!/bin/bash",
    // Ensure claude is on PATH (common install locations)
    'export PATH="$HOME/.claude/local/bin:$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"',
  ];

  if (opts.cwd) {
    lines.push(`cd ${shellQuote(opts.cwd)}`);
  }

  // Build the claude command with only values quoted (not flags)
  const argPairs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      // Flag: don't quote it. Next arg is its value (if it exists and isn't a flag)
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("--")) {
        argPairs.push(`${arg} ${shellQuote(nextArg)}`);
        i++; // skip the value
      } else {
        argPairs.push(arg);
      }
    } else {
      argPairs.push(shellQuote(arg));
    }
  }
  let cmd = `claude ${argPairs.join(" ")}`;

  // Use -- to terminate options, then pass the prompt as a positional argument.
  // This is critical because variadic flags like --allowedTools consume all
  // subsequent non-flag arguments, so without -- the prompt gets eaten.
  if (opts.initialPrompt) {
    cmd += " --";
    if (opts.initialPrompt.length <= 200 && !opts.initialPrompt.includes("\n")) {
      cmd += ` ${shellQuote(opts.initialPrompt)}`;
    } else {
      const promptPath = join(tempDir, `prompt-${randomUUID()}.txt`);
      writeFileSync(promptPath, opts.initialPrompt, "utf-8");
      cmd += ` "$(cat ${shellQuote(promptPath)})"`;
    }
  }

  lines.push(cmd);

  writeFileSync(scriptPath, lines.join("\n") + "\n", "utf-8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/**
 * Quote a string for safe use in a bash script.
 */
function shellQuote(value: string): string {
  // Use single quotes and escape any embedded single quotes
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Generate an osascript AppleScript snippet that opens a terminal window
 * and runs the given shell command.
 *
 * Uses 'quoted form of' to safely pass the command string to the shell,
 * avoiding AppleScript string escaping issues.
 */
export function buildOsascript(
  shellCommand: string,
  terminal: TerminalApp,
): string {
  if (terminal === "iterm2") {
    // iTerm2: use 'write text' which interprets the string as shell input
    // We use a POSIX shell -c wrapper to handle the complex command
    return `tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text ${JSON.stringify(shellCommand)}
  end tell
end tell`;
  }

  // Terminal.app: use 'do script' which runs the command in a new window
  return `tell application "Terminal"
  activate
  do script ${JSON.stringify(shellCommand)}
end tell`;
}

/**
 * Detect the preferred terminal application on the current system.
 */
export async function detectTerminal(): Promise<TerminalApp> {
  if (existsSync("/Applications/iTerm.app")) {
    return "iterm2";
  }
  return "terminal";
}

/**
 * Open an interactive Claude Code session in a new terminal window.
 *
 * Writes a self-contained shell script and tells the terminal to execute it.
 * This avoids AppleScript string-length and shell-escaping issues that occur
 * when commands with many --add-dir / --append-system-prompt-file flags are
 * passed inline.
 */
export async function openInteractiveSession(
  opts: LaunchOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    const scriptPath = writelaunchScript(opts);
    const terminal = await detectTerminal();
    const script = buildOsascript(scriptPath, terminal);

    return new Promise((resolve) => {
      // Use -ss flag for strict error reporting
      const child = exec(`osascript -ss -`, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      });
      // Pass script via stdin to avoid shell quoting issues entirely
      child.stdin?.write(script);
      child.stdin?.end();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
