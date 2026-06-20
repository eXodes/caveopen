import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// V11: caveman session.created: defaultMode full → writeModeFlag(full) iff flag unset.
// NOTE: defaultMode hardcoded 'full'; 'off' branch unreachable until config wired [config.ts:76-77].

let _tmpDir = "";

mock.module("node:os", {
  namedExports: { homedir: () => _tmpDir },
});

type ConfigModule = typeof import("../modules/caveman/lib/config.js");
type ActivationModule = typeof import("../modules/caveman/hooks/activation.js");

let cfg: ConfigModule;
let activation: ActivationModule;

before(async () => {
  _tmpDir = mkdtempSync(join(tmpdir(), "caveopen-activation-"));
  mkdirSync(join(_tmpDir, ".caveman"), { recursive: true });
  cfg = await import("../modules/caveman/lib/config.js");
  activation = await import("../modules/caveman/hooks/activation.js");
});

after(() => {
  if (_tmpDir) rmSync(_tmpDir, { recursive: true, force: true });
});

const mockCtx = {} as any;

function makeSesCreatedEvent(id: string | undefined) {
  return {
    type: "session.created" as const,
    properties: { info: { id, directory: "/test/dir" } },
  };
}

describe("V11: caveman session.created activation", () => {
  it("flag unset + defaultMode full → writeModeFlag(full)", async () => {
    cfg.removeModeFlag();
    await activation.handleSessionCreated(
      makeSesCreatedEvent("ses_act_1") as any,
      mockCtx,
    );
    assert.strictEqual(cfg.readModeFlag(), "full");
  });

  it("flag already set → no overwrite", async () => {
    cfg.writeModeFlag("lite");
    await activation.handleSessionCreated(
      makeSesCreatedEvent("ses_act_2") as any,
      mockCtx,
    );
    assert.strictEqual(cfg.readModeFlag(), "lite");
  });

  it("wrong event type → no-op", async () => {
    cfg.writeModeFlag("ultra");
    await activation.handleSessionCreated(
      { type: "session.idle", properties: { sessionID: "ses_act_3" } } as any,
      mockCtx,
    );
    assert.strictEqual(cfg.readModeFlag(), "ultra");
  });

  it("event with no session id → no-op (early return)", async () => {
    cfg.writeModeFlag("full");
    await activation.handleSessionCreated(
      makeSesCreatedEvent(undefined) as any,
      mockCtx,
    );
    // Should not throw; mode unchanged
    assert.strictEqual(cfg.readModeFlag(), "full");
  });
});
