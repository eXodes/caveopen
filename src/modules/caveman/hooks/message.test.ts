import { describe, it, beforeAll, afterAll, vi } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// caveman chat.message hook — activation/deactivation phrases.

const { state } = vi.hoisted(() => ({ state: { tmpDir: "" } }));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => state.tmpDir };
});

type ConfigModule = typeof import("../lib/config.js");
type MessageModule = typeof import("./message.js");

let cfg: ConfigModule;
let msgMod: MessageModule;

beforeAll(async () => {
  state.tmpDir = mkdtempSync(join(tmpdir(), "caveopen-msg-"));
  mkdirSync(join(state.tmpDir, ".caveman"), { recursive: true });
  cfg = await import("../lib/config.js");
  msgMod = await import("./message.js");
});

afterAll(() => {
  if (state.tmpDir) rmSync(state.tmpDir, { recursive: true, force: true });
});

function makeOutput(text: string) {
  return { parts: [{ type: "text" as const, text }] };
}

describe("caveman message mode-switch + phrases", () => {
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
