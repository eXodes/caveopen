import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavekitPlugin — spec-driven development (SDD) hooks.
 *
 * Placeholder: will read SPEC.md and inject spec context into the session,
 * enforce invariants, and assist with plan/build/check workflow.
 *
 * Planned hooks:
 *   - session.created                     load SPEC.md into session context
 *   - experimental.session.compacting     re-inject spec after compaction
 *   - tool.execute.before                 guard writes against §V invariants
 *   - tool.definition                     augment bash/edit descriptions with spec hints
 */
export const CavekitPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:cavekit", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement cavekit hooks
  };
};
