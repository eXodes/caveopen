import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V18: ck:init: existed → "overwritten"; else → "copied". ∀ case → copy file.
// V25: empty parts → push new part with copy result text.
// V26: copyFile failure → push error part w/ path & msg.

let existsValue = false;
let copyFileShouldThrow: Error | null = null;
const copyFileCalls: Array<[string, string]> = [];

mock.module("node:fs", {
  namedExports: {
    existsSync: (_path: string) => existsValue,
  },
});

mock.module("node:fs/promises", {
  defaultExport: {
    copyFile: async (src: string, dest: string) => {
      if (copyFileShouldThrow) throw copyFileShouldThrow;
      copyFileCalls.push([src, dest]);
    },
  },
  namedExports: {
    copyFile: async (src: string, dest: string) => {
      if (copyFileShouldThrow) throw copyFileShouldThrow;
      copyFileCalls.push([src, dest]);
    },
  },
});

let commandExecuteBeforeHook: (
  ctx: any,
) => (input: any, output: any) => Promise<void>;

before(async () => {
  const mod = await import("../modules/cavekit/hooks/command.js");
  commandExecuteBeforeHook = mod.commandExecuteBeforeHook;
});

const SID = "ses_ck_test";

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

describe("V18: ck:init copy/overwrite label", () => {
  it("not existed → includes 'copied' text", async () => {
    existsValue = false;
    copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook({} as any);
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
    existsValue = true;
    copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook({} as any);
    const output = { parts: makeExistingParts() };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("overwritten"), `expected overwritten, got: ${text}`);
  });
});

describe("V25: ck:init empty-parts fallback", () => {
  it("empty parts → pushes new part", async () => {
    existsValue = false;
    copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook({} as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    assert.ok(output.parts.length > 0, "should have pushed a part");
    const text = output.parts[0]?.text ?? "";
    assert.ok(text.length > 0, "pushed part should have non-empty text");
  });

  it("empty parts push includes FORMAT.md reference", async () => {
    existsValue = false;
    copyFileShouldThrow = null;

    const handler = commandExecuteBeforeHook({} as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("FORMAT.md"), `expected FORMAT.md in: ${text}`);
  });
});

describe("V26: ck:init copyFile error → error part", () => {
  it("copyFile throws → pushes error part, no throw", async () => {
    existsValue = false;
    copyFileShouldThrow = new Error("EACCES: permission denied");

    const handler = commandExecuteBeforeHook({} as any);
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
    existsValue = false;
    copyFileShouldThrow = new Error("EACCES: permission denied");

    const handler = commandExecuteBeforeHook({} as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("ck:init"), output);

    const text = output.parts[0]?.text ?? "";
    assert.ok(text.includes("FORMAT.md"), `expected path in error: ${text}`);
  });
});

describe("misc: ck:init non-command passthrough", () => {
  it("non-ck:init command → no-op", async () => {
    const handler = commandExecuteBeforeHook({} as any);
    const output = { parts: [] as any[] };
    await handler(makeInput("other-cmd"), output);
    assert.strictEqual(output.parts.length, 0);
  });

  it("copyFile called with FORMAT.md paths", async () => {
    existsValue = false;
    copyFileShouldThrow = null;
    copyFileCalls.length = 0;

    const handler = commandExecuteBeforeHook({} as any);
    await handler(makeInput("ck:init"), { parts: makeExistingParts() });

    assert.strictEqual(copyFileCalls.length, 1);
    const [src, dest] = copyFileCalls[0]!;
    assert.ok(src!.endsWith("FORMAT.md"), `src: ${src}`);
    assert.ok(dest!.endsWith("FORMAT.md"), `dest: ${dest}`);
  });
});
