import { exec } from "node:child_process";

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
 * Escape double-quotes inside a string that will be placed within double-quotes.
 */
function escapeDoubleQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Strip characters that are unsafe for a shell --name value.
 * Quotes are simply removed to avoid breaking the outer quoting.
 */
function sanitizeName(value: string): string {
  return value.replace(/"/g, "");
}

/**
 * Build the `claude` CLI command string from the given options.
 */
export function buildClaudeCommand(opts: LaunchOptions): string {
  const parts: string[] = ["claude"];

  parts.push(`--add-dir ${opts.skillsDir}`);
  parts.push(`--add-dir ${opts.instructionsDir}`);

  const safeName = sanitizeName(opts.agentName);
  parts.push(`--name "Meeting: ${safeName}"`);

  if (opts.sessionId) {
    parts.push(`--resume ${opts.sessionId}`);
  }

  if (opts.initialPrompt) {
    parts.push(`"${escapeDoubleQuotes(opts.initialPrompt)}"`);
  }

  return parts.join(" ");
}

/**
 * Escape a string for embedding inside an AppleScript double-quoted string.
 * AppleScript uses backslash-escaping for double-quotes and backslashes.
 * Single-quotes inside the shell command part also need escaping because
 * AppleScript's `quoted form` isn't used here.
 */
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
}

/**
 * Generate an osascript AppleScript snippet that opens a terminal window and
 * runs the given command.
 */
export function buildOsascript(
  command: string,
  terminal: TerminalApp,
  cwd?: string,
): string {
  const safeCommand = escapeForAppleScript(command);
  const cdPart = cwd ? `cd ${escapeForAppleScript(cwd)} && ` : "";
  const fullCommand = `${cdPart}${safeCommand}`;

  if (terminal === "iterm2") {
    return [
      'tell application "iTerm"',
      "  activate",
      "  set newWindow to (create window with default profile)",
      "  tell current session of newWindow",
      `    write text "${fullCommand}"`,
      "  end tell",
      "end tell",
    ].join("\n");
  }

  // Terminal.app
  return [
    'tell application "Terminal"',
    "  activate",
    `  do script "${fullCommand}"`,
    "end tell",
  ].join("\n");
}

/**
 * Detect the preferred terminal application on the current system.
 * Returns "iterm2" if iTerm2 is running, otherwise falls back to "terminal".
 */
export async function detectTerminal(): Promise<TerminalApp> {
  return new Promise((resolve) => {
    exec(
      'osascript -e \'tell application "System Events" to (name of processes) contains "iTerm2"\'',
      (error, stdout) => {
        if (!error && stdout.trim() === "true") {
          resolve("iterm2");
        } else {
          resolve("terminal");
        }
      },
    );
  });
}

/**
 * Open an interactive Claude Code session in a new terminal window.
 *
 * 1. Builds the `claude` CLI invocation from options.
 * 2. Detects which terminal emulator to use (iTerm2 or Terminal.app).
 * 3. Generates and executes the osascript to open the window.
 */
export async function openInteractiveSession(
  opts: LaunchOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    const command = buildClaudeCommand(opts);
    const terminal = await detectTerminal();
    const script = buildOsascript(command, terminal, opts.cwd);

    return new Promise((resolve) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
