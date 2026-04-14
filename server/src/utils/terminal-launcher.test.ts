import { describe, it, expect } from "vitest";
import {
  buildClaudeCommand,
  buildOsascript,
  type LaunchOptions,
} from "./terminal-launcher.js";

describe("buildClaudeCommand", () => {
  const baseOpts: LaunchOptions = {
    agentName: "Alice",
    skillsDir: "/home/user/.paperclip/skills",
    instructionsDir: "/home/user/.paperclip/instructions",
  };

  it("builds a basic command with required options", () => {
    const cmd = buildClaudeCommand(baseOpts);
    expect(cmd).toContain("claude");
    expect(cmd).toContain("--add-dir /home/user/.paperclip/skills");
    expect(cmd).toContain("--add-dir /home/user/.paperclip/instructions");
    expect(cmd).toContain('--name "Meeting: Alice"');
  });

  it("includes --resume when sessionId is provided", () => {
    const cmd = buildClaudeCommand({ ...baseOpts, sessionId: "sess-123" });
    expect(cmd).toContain("--resume sess-123");
  });

  it("does not include --resume when sessionId is omitted", () => {
    const cmd = buildClaudeCommand(baseOpts);
    expect(cmd).not.toContain("--resume");
  });

  it("appends initial prompt at the end", () => {
    const cmd = buildClaudeCommand({
      ...baseOpts,
      initialPrompt: "Hello, start working",
    });
    // The prompt should be at the very end, after all flags
    expect(cmd).toMatch(/--name "Meeting: Alice".*"Hello, start working"$/);
  });

  it("does not append prompt when initialPrompt is omitted", () => {
    const cmd = buildClaudeCommand(baseOpts);
    // Command should end with the --name flag, no trailing prompt argument
    expect(cmd.endsWith('--name "Meeting: Alice"')).toBe(true);
  });

  it("handles quotes in agent names by escaping them", () => {
    const cmd = buildClaudeCommand({
      ...baseOpts,
      agentName: 'Bob "The Builder"',
    });
    // The name should be safely escaped
    expect(cmd).toContain("--name");
    // Should not have unescaped inner quotes that break the command
    expect(cmd).not.toMatch(/--name ".*".*"/);
    expect(cmd).toContain('--name "Meeting: Bob The Builder"');
  });

  it("handles quotes in initialPrompt by escaping them", () => {
    const cmd = buildClaudeCommand({
      ...baseOpts,
      initialPrompt: 'Say "hello world"',
    });
    // Escaped quotes inside the prompt string
    expect(cmd).toContain("Say \\\"hello world\\\"");
  });

  it("includes all flags together", () => {
    const cmd = buildClaudeCommand({
      ...baseOpts,
      sessionId: "sess-456",
      initialPrompt: "Start task",
    });
    expect(cmd).toContain("--add-dir /home/user/.paperclip/skills");
    expect(cmd).toContain("--add-dir /home/user/.paperclip/instructions");
    expect(cmd).toContain('--name "Meeting: Alice"');
    expect(cmd).toContain("--resume sess-456");
    expect(cmd).toContain('"Start task"');
  });
});

describe("buildOsascript", () => {
  const testCommand = 'claude --name "Meeting: Alice"';

  describe("iterm2", () => {
    it("generates valid AppleScript for iTerm2", () => {
      const script = buildOsascript(testCommand, "iterm2");
      expect(script).toContain("iTerm");
      expect(script).toContain("create window with default profile");
      // Quotes in the command are escaped for AppleScript embedding
      expect(script).toContain('claude --name \\"Meeting: Alice\\"');
    });

    it("wraps the command in a write text call", () => {
      const script = buildOsascript(testCommand, "iterm2");
      expect(script).toContain("write text");
    });
  });

  describe("terminal", () => {
    it("generates valid AppleScript for Terminal.app", () => {
      const script = buildOsascript(testCommand, "terminal");
      expect(script).toContain("Terminal");
      expect(script).toContain("do script");
      // Quotes in the command are escaped for AppleScript embedding
      expect(script).toContain('claude --name \\"Meeting: Alice\\"');
    });
  });

  it("handles commands with special characters", () => {
    const cmdWithSpecials = 'claude --name "Meeting: O\'Brien"';
    const script = buildOsascript(cmdWithSpecials, "terminal");
    expect(script).toContain("Terminal");
    // Should still contain the command
    expect(script).toContain("O\\'Brien");
  });

  describe("with cwd", () => {
    it("includes cd command for iterm2 when cwd is provided", () => {
      const script = buildOsascript(testCommand, "iterm2", "/some/dir");
      expect(script).toContain("cd /some/dir");
    });

    it("includes cd command for terminal when cwd is provided", () => {
      const script = buildOsascript(testCommand, "terminal", "/some/dir");
      expect(script).toContain("cd /some/dir");
    });

    it("omits cd when cwd is not provided", () => {
      const script = buildOsascript(testCommand, "terminal");
      expect(script).not.toContain("cd ");
    });
  });
});
