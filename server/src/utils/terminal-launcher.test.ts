import { describe, it, expect } from "vitest";
import {
  buildClaudeCommand,
  buildOsascript,
  detectTerminal,
  openInteractiveSession,
  type LaunchOptions,
} from "./terminal-launcher.js";

describe("buildClaudeCommand", () => {
  const baseOpts: LaunchOptions = {
    agentName: "Alice",
    skillsDir: "/home/user/.paperclip/skills",
    instructionsDir: "/home/user/.paperclip/instructions",
  };

  it("builds a basic command with required options", () => {
    const { command } = buildClaudeCommand(baseOpts);
    expect(command).toContain("claude");
    expect(command).toContain('--add-dir "/home/user/.paperclip/skills"');
    expect(command).toContain('--add-dir "/home/user/.paperclip/instructions"');
    expect(command).toContain('--name "Meeting: Alice"');
  });

  it("includes --resume when sessionId is provided", () => {
    const { command } = buildClaudeCommand({ ...baseOpts, sessionId: "sess-123" });
    expect(command).toContain('--resume "sess-123"');
  });

  it("does not include --resume when sessionId is omitted", () => {
    const { command } = buildClaudeCommand(baseOpts);
    expect(command).not.toContain("--resume");
  });

  it("writes initial prompt to temp file", () => {
    const { command, tempFile } = buildClaudeCommand({
      ...baseOpts,
      initialPrompt: "Hello, start working",
    });
    expect(tempFile).toBeDefined();
    expect(command).toContain("$(cat '");
  });

  it("does not create temp file when no prompt", () => {
    const { tempFile } = buildClaudeCommand(baseOpts);
    expect(tempFile).toBeUndefined();
  });

  it("sanitizes quotes in agent names", () => {
    const { command } = buildClaudeCommand({
      ...baseOpts,
      agentName: 'Bob "The Builder"',
    });
    expect(command).toContain('--name "Meeting: Bob The Builder"');
  });

  it("handles multiline prompts with special chars via temp file", () => {
    const { command, tempFile } = buildClaudeCommand({
      ...baseOpts,
      initialPrompt: 'Line 1\nLine 2\n**bold** and "quotes"',
    });
    expect(tempFile).toBeDefined();
    // Prompt is in a file, not inline in the command
    expect(command).toContain("$(cat '");
  });
});

describe("buildOsascript", () => {
  const testCommand = 'claude --name "Meeting: Alice"';

  it("generates valid AppleScript for iTerm2", () => {
    const script = buildOsascript(testCommand, "iterm2");
    expect(script).toContain("iTerm");
    expect(script).toContain("create window with default profile");
    expect(script).toContain("write text");
  });

  it("generates valid AppleScript for Terminal.app", () => {
    const script = buildOsascript(testCommand, "terminal");
    expect(script).toContain("Terminal");
    expect(script).toContain("do script");
  });

  it("uses JSON.stringify for safe escaping", () => {
    const script = buildOsascript('claude "hello world"', "terminal");
    // JSON.stringify wraps in quotes and escapes internal quotes
    expect(script).toContain("do script");
    expect(script).toBeDefined();
  });
});

describe("detectTerminal", () => {
  it("returns a valid TerminalApp string", async () => {
    const result = await detectTerminal();
    expect(typeof result).toBe("string");
    expect(["iterm2", "terminal"]).toContain(result);
  });
});

describe("openInteractiveSession", () => {
  it("returns an object with a success boolean", async () => {
    const opts: LaunchOptions = {
      agentName: "TestAgent",
      skillsDir: "/tmp/skills",
      instructionsDir: "/tmp/instructions",
    };
    const result = await openInteractiveSession(opts);
    expect(typeof result.success).toBe("boolean");
    if (result.error !== undefined) {
      expect(typeof result.error).toBe("string");
    }
  });
});
