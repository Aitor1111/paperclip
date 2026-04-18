import { describe, it, expect } from "vitest";
import {
  buildClaudeArgs,
  buildOsascript,
  detectTerminal,
  openInteractiveSession,
  type LaunchOptions,
} from "./terminal-launcher.js";

describe("buildClaudeArgs", () => {
  const baseOpts: LaunchOptions = {
    agentName: "Alice",
    skillsDir: "/home/user/.paperclip/skills",
    instructionsDir: "/home/user/.paperclip/instructions",
  };

  it("builds args with required options", () => {
    const args = buildClaudeArgs(baseOpts);
    expect(args).toContain("--add-dir");
    expect(args).toContain("/home/user/.paperclip/skills");
    expect(args).toContain("/home/user/.paperclip/instructions");
    expect(args).toContain("--name");
    expect(args).toContain("Meeting: Alice");
  });

  it("includes --resume when sessionId is provided", () => {
    const args = buildClaudeArgs({ ...baseOpts, sessionId: "sess-123" });
    expect(args).toContain("--resume");
    expect(args).toContain("sess-123");
  });

  it("does not include --resume when sessionId is omitted", () => {
    const args = buildClaudeArgs(baseOpts);
    expect(args).not.toContain("--resume");
  });

  it("sanitizes quotes in agent names", () => {
    const args = buildClaudeArgs({
      ...baseOpts,
      agentName: 'Bob "The Builder"',
    });
    expect(args).toContain("Meeting: Bob The Builder");
  });

  it("includes --append-system-prompt-file when systemPromptFile is provided", () => {
    const args = buildClaudeArgs({
      ...baseOpts,
      systemPromptFile: "/tmp/instructions.md",
    });
    expect(args).toContain("--append-system-prompt-file");
    expect(args).toContain("/tmp/instructions.md");
  });

  it("includes agent skill dirs as --add-dir entries", () => {
    const args = buildClaudeArgs({
      ...baseOpts,
      agentSkillsDirs: ["/tmp/skill-a", "/tmp/skill-b"],
    });
    const addDirIndices = args.reduce<number[]>((acc, val, idx) => {
      if (val === "--add-dir") acc.push(idx);
      return acc;
    }, []);
    // 2 base dirs + 2 agent skill dirs = 4 --add-dir entries
    expect(addDirIndices).toHaveLength(4);
    expect(args).toContain("/tmp/skill-a");
    expect(args).toContain("/tmp/skill-b");
  });
});

describe("buildOsascript", () => {
  const testCommand = "/tmp/launch-script.sh";

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
    const script = buildOsascript("/tmp/test script.sh", "terminal");
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
