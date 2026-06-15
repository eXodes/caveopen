import crypto from "node:crypto";

export function cuid({ length = 24 } = {}) {
  // 1. Collect unpredictable entropy sources
  const timestamp = Date.now().toString(36);
  const randomEntropy = crypto.randomBytes(32).toString("hex");

  // 2. High-performance, secure SHA3-512 hashing (like CUID2 specification)
  const hash = crypto
    .createHash("sha3-512")
    .update(timestamp + randomEntropy)
    .digest("base64url") // URL and name-friendly encoding
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // Ensure pure alphanumeric

  // 3. Force start with a letter to guarantee HTML element ID safety
  const prefix = String.fromCharCode(97 + (crypto.randomBytes(1)[0] % 26));

  return (prefix + hash).substring(0, length);
}
