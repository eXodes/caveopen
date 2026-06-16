import { spawn } from "node:child_process";

function spawnNode(name: string, json: string): Promise<string> {
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
    text = await spawnNode(name, json);
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
