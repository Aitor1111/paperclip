import { exec } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface LaunchOptions {
  agentName: string;
  skillsDir: string;
  instructionsDir: string;
  initialPrompt?: string;
  sessionId?: string;
  cwd?: string;
}

export type TerminalApp = "iterm2" | "terminal";

/**
 * Strip characters that are unsafe for a shell --name value.
 */
function sanitizeName(value: string): string {
  return value.replace(/"/g, "");
}

/**
 * Build the `claude` CLI command string from the given options.
 * If there's an initialPrompt, it's written to a temp file and passed
 * as the prompt argument to avoid shell escaping issues.
 */
export function buildClaudeCommand(opts: LaunchOptions): { command: string; tempFile?: string } {
  const parts: string[] = ["claude"];

  parts.push(`--add-dir "${opts.skillsDir}"`);
  parts.push(`--add-dir "${opts.instructionsDir}"`);

  const safeName = sanitizeName(opts.agentName);
  parts.push(`--name "Meeting: ${safeName}"`);

  if (opts.sessionId) {
    parts.push(`--resume "${opts.sessionId}"`);
  }

  let tempFile: string | undefined;

  if (opts.initialPrompt) {
    // Write prompt to temp file to avoid shell/AppleScript escaping nightmares
    const tempDir = join(tmpdir(), "paperclip-meet");
    mkdirSync(tempDir, { recursive: true });
    tempFile = join(tempDir, `prompt-${randomUUID()}.txt`);
    writeFileSync(tempFile, opts.initialPrompt, "utf-8");
    // Use cat to pipe the prompt file content as the initial message
    parts.push(`"$(cat '${tempFile}')"`);
  }

  return { command: parts.join(" "), tempFile };
}

/**
 * Build a shell command string with cd prefix if cwd is provided.
 */
function buildFullShellCommand(command: string, cwd?: string): string {
  if (cwd) {
    return `cd '${cwd}' && ${command}`;
  }
  return command;
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
 */
export async function openInteractiveSession(
  opts: LaunchOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { command } = buildClaudeCommand(opts);
    const terminal = await detectTerminal();
    const fullShellCommand = buildFullShellCommand(command, opts.cwd);
    const script = buildOsascript(fullShellCommand, terminal);

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
