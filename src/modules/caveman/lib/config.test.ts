import { describe, it, beforeAll, afterAll, vi } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// readModeFlag returns null when file absent or mode not in valid set.

const { state } = vi.hoisted(() => ({ state: { tmpDir: "" } }));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => state.tmpDir };
});

type CavemanConfigModule = typeof import("./config.js");

let config: CavemanConfigModule;

beforeAll(async () => {
  state.tmpDir = mkdtempSync(join(tmpdir(), "caveopen-config-"));
  config = await import("./config.js");
});

afterAll(() => {
  if (state.tmpDir) rmSync(state.tmpDir, { recursive: true, force: true });
});

describe("isValidMode", () => {
  it("valid modes return true", () => {
    for (const m of [
      "lite",
      "full",
      "ultra",
      "wenyan-lite",
      "wenyan-full",
      "wenyan-ultra",
    ]) {
      assert.ok(config.isValidMode(m), `expected "${m}" to be valid`);
    }
  });

  it("invalid modes return false", () => {
    for (const m of ["", "medium", "off", "FULL", "lite-extra", "wenyan"]) {
      assert.ok(!config.isValidMode(m), `expected "${m}" to be invalid`);
    }
  });
});

describe("readModeFlag", () => {
  it("file absent → null", () => {
    try {
      config.removeModeFlag();
    } catch {}
    assert.strictEqual(config.readModeFlag(), null);
  });

  it("valid mode → returned", () => {
    mkdirSync(config.CAVEMAN_DIR, { recursive: true });
    writeFileSync(config.MODE_FILE, "full", "utf8");
    assert.strictEqual(config.readModeFlag(), "full");
  });

  it("invalid content → null", () => {
    mkdirSync(config.CAVEMAN_DIR, { recursive: true });
    writeFileSync(config.MODE_FILE, "bogus-mode", "utf8");
    assert.strictEqual(config.readModeFlag(), null);
  });

  it("all valid modes read correctly", () => {
    mkdirSync(config.CAVEMAN_DIR, { recursive: true });
    for (const m of [
      "lite",
      "full",
      "ultra",
      "wenyan-lite",
      "wenyan-full",
      "wenyan-ultra",
    ] as const) {
      writeFileSync(config.MODE_FILE, m, "utf8");
      assert.strictEqual(config.readModeFlag(), m);
    }
  });

  it("writeModeFlag + readModeFlag roundtrip", () => {
    config.writeModeFlag("ultra");
    assert.strictEqual(config.readModeFlag(), "ultra");
  });

  it("removeModeFlag → readModeFlag returns null", () => {
    config.writeModeFlag("lite");
    config.removeModeFlag();
    assert.strictEqual(config.readModeFlag(), null);
  });
});
