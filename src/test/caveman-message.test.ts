import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// V10: caveman chat.message hook — activation/deactivation phrases.

let _tmpDir = "";

mock.module("node:os", {
  namedExports: { homedir: () => _tmpDir },
});

type ConfigModule = typeof import("../modules/caveman/lib/config.js");
type MessageModule = typeof import("../modules/caveman/hooks/message.js");

let cfg: ConfigModule;
let msgMod: MessageModule;

before(async () => {
  _tmpDir = mkdtempSync(join(tmpdir(), "caveopen-msg-"));
  mkdirSync(join(_tmpDir, ".caveman"), { recursive: true });
  cfg = await import("../modules/caveman/lib/config.js");
  msgMod = await import("../modules/caveman/hooks/message.js");
});

after(() => {
  if (_tmpDir) rmSync(_tmpDir, { recursive: true, force: true });
});

function makeOutput(text: string) {
  return { parts: [{ type: "text" as const, text }] };
}

describe("V10: caveman message mode-switch + phrases", () => {
  it("'activate caveman' → writeModeFlag(default=full)", async () => {
    cfg.removeModeFlag();
    const handler = msgMod.chatMessageHook({} as any);
    await handler({} as any, makeOutput("activate caveman") as any);
    assert.strictEqual(cfg.readModeFlag(), "full");
  });

  it("'stop caveman' → removeModeFlag", async () => {
    cfg.writeModeFlag("full");
    const handler = msgMod.chatMessageHook({} as any);
    await handler({} as any, makeOutput("stop caveman") as any);
    assert.strictEqual(cfg.readModeFlag(), null);
  });

  it("'normal mode' → removeModeFlag", async () => {
    cfg.writeModeFlag("lite");
    const handler = msgMod.chatMessageHook({} as any);
    await handler({} as any, makeOutput("normal mode") as any);
    assert.strictEqual(cfg.readModeFlag(), null);
  });

  it("'caveman off' → removeModeFlag", async () => {
    cfg.writeModeFlag("full");
    const handler = msgMod.chatMessageHook({} as any);
    await handler({} as any, makeOutput("caveman off") as any);
    assert.strictEqual(cfg.readModeFlag(), null);
  });

  it("unrelated text → no change", async () => {
    cfg.writeModeFlag("ultra");
    const handler = msgMod.chatMessageHook({} as any);
    await handler(
      {} as any,
      makeOutput("hello world, explain this code") as any,
    );
    assert.strictEqual(cfg.readModeFlag(), "ultra");
  });

  it("all activation phrases trigger mode write", async () => {
    const phrases = [
      "caveman mode",
      "use caveman",
      "less tokens",
      "be brief",
      "save tokens",
      "compress mode",
    ];
    for (const phrase of phrases) {
      cfg.removeModeFlag();
      const handler = msgMod.chatMessageHook({} as any);
      await handler({} as any, makeOutput(phrase) as any);
      assert.strictEqual(
        cfg.readModeFlag(),
        "full",
        `phrase "${phrase}" should activate caveman`,
      );
    }
  });

  it("empty parts text → no change", async () => {
    cfg.writeModeFlag("lite");
    const handler = msgMod.chatMessageHook({} as any);
    await handler({} as any, { parts: [] } as any);
    assert.strictEqual(cfg.readModeFlag(), "lite");
  });
});
