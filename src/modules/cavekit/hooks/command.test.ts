import { describe, it, beforeAll, vi } from "vitest";
import assert from "node:assert/strict";

// FORMAT.md copy behavior: existed → "overwritten"; else → "copied". All cases → copy file.
// empty parts → push new part with copy result text.
// copyFile failure → push error part with path and message.

const { fsState, copyFileCalls, copyFile } = vi.hoisted(() => {
  const fsState = {
    existsValue: false,
    copyFileShouldThrow: null as Error | null,
  };
  const copyFileCalls: Array<[string, string]> = [];
  const copyFile = vi.fn(async (src: string, dest: string) => {
    if (fsState.copyFileShouldThrow) throw fsState.copyFileShouldThrow;
    copyFileCalls.push([src, dest]);
  });
  return { fsState, copyFileCalls, copyFile };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: (_path: string) => fsState.existsValue,
  };
});

vi.mock("node:fs/promises", () => ({
  default: { copyFile },
  copyFile,
}));

let commandExecuteBeforeHook: (ctx: any) => (input: any, output: any) => Promise<void>;

beforeAll(async () => {
  const mod = await import("./command.js");
  commandExecuteBeforeHook = mod.commandExecuteBeforeHook;
});

const SID = "ses_ck_test";
const CTX = { directory: "/tmp/caveopen-test" };

function makeInput(command: string) {
  return { command, sessionID: SID, arguments: undefined };
}

function makeExistingParts() {
  return [
    {
      id: "part_1",
      messageID: "msg_1",
      sessionID: SID,
      type: "text" as const,
      text: "placeholder",
    },
  ];
}

describe("ck:init copy/overwrite label", () => {
  it("not existed → includes 'copied' text", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeExistingParts() };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(
      text.includes("copied") || text.includes("FORMAT.md"),
      `expected copy text, got: ${text}`,
    );
    assert.ok(!text.includes("overwritten"), `should not say overwritten: ${text}`);
  });

  it("existed → includes 'overwritten' text", async () => {
    fsState.existsValue = true;
    fsState.copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeExistingParts() };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("overwritten"), `expected overwritten, got: ${text}`);
  });
});

describe("ck:init empty-parts fallback", () => {
  it("empty parts → pushes new part", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    assert.ok(output.parts.length > 0, "should have pushed a part");
    const text = output.parts[0]?.text ?? "";
    assert.ok(text.length > 0, "pushed part should have non-empty text");
  });

  it("empty parts push includes FORMAT.md reference", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = null;

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("FORMAT.md"), `expected FORMAT.md in: ${text}`);
  });
});

describe("ck:init copyFile error → error part", () => {
  it("copyFile throws → pushes error part, no throw", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = new Error("EACCES: permission denied");

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };

    let threw = false;
    try {
      await handler(makeInput("ck:init"), output);
    } catch {
      threw = true;
    }

    assert.strictEqual(threw, false, "handler should not throw");
    assert.ok(output.parts.length > 0, "should push error part");
    const text = output.parts[0]?.text ?? "";
    assert.ok(
      text.toLowerCase().includes("failed") ||
        text.includes("EACCES") ||
        text.includes("permission"),
      `expected error text in: ${text}`,
    );
  });

  it("error part includes destination path", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = new Error("EACCES: permission denied");

    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("FORMAT.md"), `expected path in error: ${text}`);
  });
});

describe("misc: ck:init non-command passthrough", () => {
  it("non-ck:init command → no-op", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("other-cmd"), output);
    assert.strictEqual(output.parts.length, 0);
  });

  it("copyFile called with FORMAT.md paths", async () => {
    fsState.existsValue = false;
    fsState.copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook(CTX as any);
    await handler(makeInput("ck:init"), { parts: makeExistingParts() });

    assert.strictEqual(copyFileCalls.length, 1);
    const [src, dest] = copyFileCalls[0]!;
    assert.ok(src!.endsWith("FORMAT.md"), `src: ${src}`);
    assert.ok(dest!.endsWith("FORMAT.md"), `dest: ${dest}`);
  });
});
