declare const Bun: {
  spawn(cmd: string[], opts: { stdin: "pipe"; stdout: "pipe"; stderr: "pipe" }): {
    stdin: { write(s: string): void; end(): void };
    stdout: ReadableStream;
    exited: Promise<number>;
  };
} | undefined;

async function spawnBun(name: string, json: string): Promise<string> {
  const proc = Bun!.spawn(["cavemem", "hook", "run", name], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(json);
  proc.stdin.end();
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
}

function spawnNode(name: string, json: string): Promise<string> {
  const { spawn } = require("child_process") as typeof import("child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("cavemem", ["hook", "run", name], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", () => resolve(out));
    proc.on("error", reject);
    proc.stdin.write(json);
    proc.stdin.end();
  });
}

export async function runCavememHook(
  name: string,
  payload: object,
): Promise<string | null> {
  const json = JSON.stringify(payload);
  let text: string;
  try {
    text =
      typeof Bun !== "undefined" && Bun != null ?
        await spawnBun(name, json)
      : await spawnNode(name, json);
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed?.hookSpecificOutput?.additionalContext ?? null;
  } catch {
    return null;
  }
}
