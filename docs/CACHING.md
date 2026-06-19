# Caching in OpenCode

OpenCode uses two distinct caching layers: **prompt caching** (LLM-level, reduces token costs) and **session-keyed cache hints** (provider-level, enables KV cache reuse across requests).

---

## 1. Prompt Caching — `applyCaching()`

**Source:** `packages/opencode/src/provider/transform.ts` → `ProviderTransform.applyCaching()`

### What it does

Marks specific messages with provider cache-control headers so the provider can store and reuse the KV cache for those message segments.

### Which messages get marked

```
system[0..1]   ← up to 2 system messages
non-system[-2..]  ← last 2 non-system messages (most recent context)
```

Combined into a deduplicated set via `unique([...system, ...final])`.

### Trigger condition

`applyCaching()` is called **only for Claude/Anthropic models**:

```ts
// packages/opencode/src/provider/transform.ts → ProviderTransform.message()
if (
  model.providerID === "anthropic" ||
  model.providerID === "google-vertex-anthropic" ||
  model.api.id.includes("anthropic") ||
  model.api.id.includes("claude") ||
  model.id.includes("anthropic") ||
  model.id.includes("claude") ||
  model.api.npm === "@ai-sdk/anthropic"
) {
  // && model.api.npm !== "@ai-sdk/gateway"  ← gateway excluded (uses its own caching)
  msgs = applyCaching(msgs, model);
}
```

### Provider-specific cache control syntax

Each provider expects different field names. `applyCaching()` injects all of them simultaneously — the AI SDK passes only the relevant namespace to each provider:

| Provider / SDK key | Cache control shape                                |
| ------------------ | -------------------------------------------------- |
| `anthropic`        | `{ cacheControl: { type: "ephemeral" } }`          |
| `openrouter`       | `{ cacheControl: { type: "ephemeral" } }`          |
| `bedrock`          | `{ cachePoint: { type: "default" } }`              |
| `openaiCompatible` | `{ cache_control: { type: "ephemeral" } }`         |
| `copilot`          | `{ copilot_cache_control: { type: "ephemeral" } }` |

### Placement: message-level vs. content-level

**Anthropic and Bedrock** require cache control at the message level:

```ts
msg.providerOptions = mergeDeep(msg.providerOptions ?? {}, providerOptions);
```

**All other providers** get it on the last content block of the message (content-level):

```ts
const lastContent = msg.content[msg.content.length - 1];
lastContent.providerOptions = mergeDeep(
  lastContent.providerOptions ?? {},
  providerOptions,
);
```

---

## 2. Session-Keyed Cache Hints — `options()`

**Source:** `packages/opencode/src/provider/transform.ts` → `ProviderTransform.options()`

Some providers support a stable cache key so KV cache persists across separate API calls in the same session. OpenCode uses the `sessionID` for this.

```ts
// OpenAI (native + any provider with setCacheKey flag)
if (model.providerID === "openai" || input.providerOptions?.setCacheKey) {
  result["promptCacheKey"] = input.sessionID;
}

// Venice
if (model.providerID === "venice") {
  result["promptCacheKey"] = input.sessionID;
}

// OpenRouter
if (model.providerID === "openrouter") {
  result["prompt_cache_key"] = input.sessionID;
}

// OpenCode hosted gateway — delegates caching strategy to the gateway
if (model.api.npm === "@ai-sdk/gateway") {
  result["gateway"] = { caching: "auto" };
}
```

**Plugin usage:** Pass `providerOptions: { setCacheKey: true }` to force session-keyed caching on OpenAI-compatible providers that support it.

---

## 3. Token Tracking

**Source:** `packages/opencode/src/session/session.ts` → `getUsage()`

OpenCode tracks cache token usage per-session and uses it for cost calculation.

### Token extraction

```ts
const cacheReadInputTokens = usage.cacheReadInputTokens ?? 0;
const cacheWriteInputTokens =
  usage.cacheWriteInputTokens ??
  metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
  metadata?.["vertex"]?.["cacheCreationInputTokens"] ?? // Vertex Anthropic
  metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
  metadata?.["venice"]?.["usage"]?.["cacheCreationInputTokens"] ??
  0;
```

### Adjusted input count

Cache tokens are subtracted from raw `inputTokens` so they can be billed at separate rates:

```ts
const adjustedInputTokens =
  inputTokens - cacheReadInputTokens - cacheWriteInputTokens;
```

### Session storage

Every session stores:

```ts
tokens: {
  input: number; // non-cached input tokens
  output: number;
  reasoning: number;
  cache: {
    read: number; // tokens served from cache (cheaper)
    write: number; // tokens written to cache (slightly more expensive)
  }
}
```

### Cost formula

```ts
cost = (tokens.input  × model.cost.input)
     + (tokens.output × model.cost.output)
     + (tokens.cache.read  × model.cost.cache.read)   // typically ~10% of input price
     + (tokens.cache.write × model.cost.cache.write)  // typically ~125% of input price
     + (tokens.reasoning × model.cost.output)
```

---

## 4. Gateway Caching (AI SDK Gateway)

When using `@ai-sdk/gateway`, OpenCode sets `gateway.caching = "auto"` and disables the `applyCaching()` path entirely. The gateway handles caching policy server-side based on its own routing logic.

---

## 5. Plugin Implications

### Observing cache performance

Cache token counts are available in the `Usage` object from the AI SDK and in `Session.Info.tokens.cache`:

```ts
// From Usage (AI SDK)
usage.cacheReadInputTokens;
usage.cacheWriteInputTokens;

// From Session.Info (persisted)
session.tokens.cache.read;
session.tokens.cache.write;
```

### Forcing cache key on custom providers

If a plugin registers a custom OpenAI-compatible provider, pass `setCacheKey: true` in `providerOptions` to get session-keyed caching:

```ts
providerOptions: {
  setCacheKey: true; // triggers promptCacheKey = sessionID in options()
}
```

### Cache control for Anthropic in plugins

The `applyCaching()` path runs automatically for any Claude model. Only the first 2 system messages (`system[0]`, `system[1]`) and last 2 conversation turns get cache markers.

**System slot ordering — use `push`, not `unshift`**

OpenCode concatenates all instructions (agent prompt, AGENTS.md, `config.instructions`) into a single large block that becomes the initial `system[0]`. This block is typically the largest system message and the most expensive cache miss.

Plugins that inject via `experimental.chat.system.transform` must use `output.system.push()` to append after the host content — never `output.system.unshift()`. Prepending with `unshift` displaces the instructions block out of the 2-slot cache window:

```
// BAD — unshift from two plugins pushes instructions to system[2], uncached:
[priorContext, ruleset, instructions↗uncached]

// GOOD — push appends after instructions, host content stays in window:
[instructions✅, ruleset✅, priorContext↗uncached]
```

When `opencode-claude-auth` is also loaded, it injects Claude Code identity via `unshift` (required — identity must precede instructions). With CaveOpen using `push`, the final order is stable regardless of plugin load order:

```
[oca-identity✅, instructions✅, ruleset↗, priorContext↗]
```

Priority for the 2 cached slots: **auth identity > host instructions > behavioral modifiers > background context**. CaveOpen's additions (ruleset, priorContext) are smaller than the instructions block and accept cache misses.

---

## Reference: File Map

| File                                          | Role                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `packages/opencode/src/provider/transform.ts` | `applyCaching()`, `options()` — core caching logic                    |
| `packages/opencode/src/session/session.ts`    | `getUsage()` — token extraction, cost calc, session storage           |
| `packages/opencode/src/provider/provider.ts`  | Calls `ProviderTransform.message()` and `ProviderTransform.options()` |
