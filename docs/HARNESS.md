# Harness Engineering

## Mental model: Feedforward + Feedback

Every harness element is either a **guide** (feedforward) or a **sensor** (feedback).

**Guides** — steer *before* the agent acts. Increase probability of good first-pass output.
Examples: AGENTS.md, skills, rules, ref docs, codemods, architecture constraints.

**Sensors** — observe *after* the agent acts, trigger self-correction.
Examples: linters, tests, type-checkers, structural analysis, AI review agents.

Feedforward-only → agent encodes rules but never finds out if they worked.
Feedback-only → agent repeats same mistakes.
Both required. Neither replaces the other.

## Computational vs Inferential

Two execution modes for guides and sensors:

| Mode | Runs on | Speed | Cost | Reliability |
|---|---|---|---|---|
| **Computational** | CPU | ms–s | Cheap | Deterministic |
| **Inferential** | GPU/NPU | seconds+ | Expensive | Probabilistic |

**Computational sensors** (linters, tests, type checks, structural analysis): run on every change. Results reliable. Build these first.

**Inferential sensors** (LLM-as-judge, AI code review): semantic judgment, higher coverage of non-structural problems. Run less frequently — post-integration or on demand.

Rule: a lint rule beats a paragraph of instructions every time. If a constraint can be computational, make it computational.

## Timing: keep quality left

Distribute sensors across the change lifecycle by cost:

```
Pre-commit (fast, cheap)
  → linters, type-check, fast test suite, basic code review agent

Post-integration in CI (slower, more thorough)
  → full test suite, mutation testing, broad code review, architecture checks

Continuous (async, outside change lifecycle)
  → dead code detection, dependency scanning, coverage quality, runtime SLO monitoring
```

Earlier = cheaper to fix. A sensor that fires pre-commit costs 10× less than one that fires in production.

## Three regulation dimensions

| Dimension | What it regulates | Harnessability |
|---|---|---|
| **Maintainability** | Code quality, conventions, structure | High — existing tooling (linters, coverage, complexity) |
| **Architecture fitness** | Module boundaries, perf, observability | Medium — fitness functions, structural tests |
| **Behaviour** | Does it do what was asked? | Low — mostly unsolved |

**Behaviour harness is the hard problem.** Trusting AI-generated tests as the sole behavioural sensor is circular — the generator wrote both code and tests. Approaches: approved fixtures, mutation testing, manual testing on behavioural tasks. No complete solution yet.

## Harnessability

Not all codebases are equally harnessable. Properties that make a codebase legible to agents:

- Strong types → type-checker as free sensor
- Clear module boundaries → structural constraint rules tractable
- Opinionated frameworks → less surface for agent to get wrong
- Enforced conventions → lint gates encode taste as assertions

**Legacy + tech debt**: harness most needed where hardest to build. Greenfield: bake harnessability in from day 1. Technology choices determine how governable the codebase will be.

**Ashby's Law of Requisite Variety**: a regulator must have at least as much variety as the system it governs. Committing to a narrow topology (e.g. "all services are CRUD JVM APIs") reduces variety → makes comprehensive harnesses achievable. Topology choice is a harness design decision.

## Harness templates

Enterprises have ~3–5 service topologies covering 80% of work. These can become **harness templates**: bundles of guides and sensors pre-wired for a topology.

Benefits: agents inherit constraints rather than inferring them; teams pick topologies partly based on available harnesses.

Risk: same versioning/contribution problems as service templates, but harder to test (non-deterministic guides).

---

## Shared patterns

**Structured state as the foundation.** Both discovered that agents fail not from bad models but from missing memory across sessions. The fix: explicit, file-resident state (feature lists, progress files, decision records) that any agent can cold-start from.

**Validation gates, not just generation.** Neither company trusts agent output without a verification loop — linters, tests, and structural rules that fire before anything merges. The harness enforces correctness, not the model.

**Garbage collection / drift cleanup.** Both landed on recurring cleanup passes — agents that scan for architectural drift and fix it. Entropy accumulates faster than any human notices; it has to be scheduled out.

**Repo legibility as a first-class concern.** The codebase must be readable by agents, not just humans. This means structured docs, clear entrypoints, and enforced conventions — so the agent doesn't have to infer context it should be given.

## Anthropic-specific

**Generator/Evaluator split (GAN-inspired).** The agent doing work cannot reliably judge its own output — especially on subjective tasks. A separate evaluator agent, calibrated with few-shot scoring criteria, breaks this. Iterations run 5–15 cycles; quality improves each round.

**Context resets over compaction.** Rather than compressing a ballooning context window, Anthropic prefers hard resets with structured handoff artifacts. Compaction makes agents anxious about token limits; resets give them a clean slate with full context of _what matters_.

**Fresh-context evaluator.** The evaluator agent should never have seen the build context — it grades from a clean window. This prevents the evaluator inheriting the generator's blind spots.

**Sandboxing as a security boundary.** Model-generated code is untreated code. Filesystem and network access must be scoped per-task — not open-ended. Prompt injection can otherwise pivot an agent into reading sensitive files or hitting unintended services.

## OpenAI-specific

**Agent legibility scorecard.** A structured checklist: bootstrap self-sufficiency, task entrypoints, validation harness, lint+format gates, agent repo map, structured docs, decision records. Agents score poorly on tasks where the repo gives them nothing to orient from.

**Progressive context disclosure.** Don't dump a 50-page AGENTS.md into the context window. Surface instructions in layers — global conventions first, task-specific detail on demand. Keeps context tight and relevant.

**Architecture enforced by linters, not convention.** Taste and structure are encoded as executable rules (custom linters, structural tests), not docs. If an agent can violate an architectural decision without a red CI gate, it will.

**Throughput changes merge philosophy.** At 1,500 PRs over 5 months, human review per-PR breaks down. The harness becomes the reviewer — automated checks replace human gatekeeping for most merges.

## The meta-pattern both landed on

> The harness is a **control system** — not a wrapper. It decides what the agent perceives, what actions it can take, and how its work is verified. The model is the executor; the harness is the engineer.

---

## Every failure is a harness gap

When an agent fails, the instinct is to re-prompt, tweak the system prompt, or blame the model. That's the wrong reflex. The right question is:

> "What would have made this failure **structurally impossible**?"

That question forces you from one-off fixes to durable constraints.

## The failure → harness loop

```
Agent fails
    ↓
Diagnose root cause (missing context? no validation? ambiguous scope?)
    ↓
Encode the fix as a constraint (invariant, lint rule, gate, handoff field)
    ↓
Verify the class of failure can't recur
    ↓
Move on
```

This is Hashimoto's principle made concrete. It's also exactly what Cavekit's `§B` backprop does — except most people treat it as a log, not a reflex.

## What "living infrastructure" means in practice

**It grows with failures, not roadmaps.** You don't plan harness improvements upfront. You discover them by running agents on real work and watching where they break. The harness backlog is your failure log.

**It shrinks with model upgrades.** Every time the underlying model improves, audit your harness. Constraints that existed to compensate for model weakness become dead weight. Delete them — they add friction without value.

**It encodes your judgment, incrementally.** Every invariant you add is a decision you've made that the agent no longer needs to make. Over time the harness accumulates your engineering taste as executable rules.

## Concrete triggers to act on

| Failure type                               | Harness response                  |
| ------------------------------------------ | --------------------------------- |
| Agent ignores a convention                 | Add a lint rule enforcing it      |
| Agent loses track mid-task                 | Add a required `HANDOFF.md` field |
| Agent over-scopes a change                 | Tighten `permission` globs        |
| Agent produces bad output it self-approves | Add an evaluator agent            |
| Agent repeats a past mistake               | Add a `§V` invariant + `§B` entry |
| Agent starts cold with no context          | Improve `AGENTS.md` / repo map    |

Each row is a closed loop — failure goes in, structural fix comes out.

## The compounding effect

Month 1: you're fixing individual agent mistakes.

Month 3: you're fixing classes of mistakes.

Month 6: whole categories of failure stop appearing because the harness prevents them before they surface.

This is how the OpenAI team got to 1,500 PRs without chaos — not because the agents got smarter, but because the harness absorbed months of failure patterns and made them impossible to repeat.

## The discipline required

The loop only compounds if you **act on every failure immediately**, not eventually. Letting failures accumulate as known issues is how harnesses stagnate. The habit is:

> Agent fails → stop → fix the harness → continue.

Not: agent fails → re-run with a better prompt → ship anyway.

That one habit, sustained, is what separates a harness that compounds from one that stays a scaffold.

---

## The big traps

### 1. Over-harnessing early

The most common mistake. You anticipate failure modes before you've seen them, build constraints for hypothetical problems, and end up with a harness that's heavier than the task warrants.

**Rule:** don't add a constraint until a failure demands it. Premature harness complexity is just premature optimization with extra steps.

### 2. Harness as prompt, not structure

Writing long AGENTS.md files full of "please do X" and "remember to Y" is still prompt engineering dressed as harness engineering. If an agent can ignore it, it's not a constraint — it's a suggestion.

**Rule:** every harness element should be **executable or verifiable**. A lint rule beats a paragraph of instructions every time.

### 3. Context bloat as a harness substitute

Dumping everything into the context window feels like giving the agent more to work with. It's actually the opposite — it buries the signal in noise and increases the chance the agent anchors on the wrong thing.

**Rule:** progressive disclosure. Global conventions at session start, task-specific detail on demand. Less context, higher quality.

### 4. Evaluator that shares the generator's context

If your evaluator has seen the build process, it inherits the generator's assumptions and blind spots. It will approve things it shouldn't because it's anchored to the same decisions.

**Rule:** fresh-context evaluator, always. No build history, just the output and the scoring criteria.

### 5. Undefined success criteria

Agents optimize for whatever you measure. If your harness has no explicit completion condition, the agent decides when it's done — and it will almost always decide too early or too late.

**Rule:** every task needs a default-FAIL contract. Every criterion starts false; the agent must produce evidence to flip it true.

### 6. Unbounded action space

Giving an agent broad tool access "just in case" is how you get unexpected side effects — files overwritten, APIs hit, services modified outside task scope. In production this is a security boundary problem, not just a quality problem.

**Rule:** least-privilege permissions from day one. Scope filesystem and network access to exactly what the task requires, nothing more.

### 7. Not deleting obsolete constraints

Harnesses accumulate. A constraint you added 3 months ago to compensate for a model weakness may now just add friction — the model no longer needs the guardrail.

**Rule:** every model upgrade is a harness audit. Treat deletion as maintenance, not risk.

### 8. Treating the harness as finished

A harness that isn't evolving is stagnating. Teams ship the initial scaffolding, move on, and wonder why agent quality plateaus. The harness needs an owner and a feedback loop.

**Rule:** the failure log is the harness backlog. If failures aren't driving harness changes, the loop is broken.

### 9. Ignoring cost as a design constraint

Long-running evaluator loops, multi-agent fanout, and heavy context loading all add up fast. A harness that's too expensive to run gets skipped — which means no eval, no validation, no safety net.

**Rule:** design for the loop you'll actually run, not the ideal one. A lightweight harness that runs on every task beats a thorough one that runs monthly.

### 10. Mistaking harness complexity for harness quality

More agents, more stages, more tools — none of that signals a good harness. The best harnesses are boring: small, predictable, and hard to surprise.

**Rule:** if you can't explain what every component does and why it exists, it's a liability, not an asset.

## Quick design checklist

- [ ] Does every constraint have a failure that motivated it?
- [ ] Is every rule executable, not advisory?
- [ ] Is the evaluator context-isolated from the generator?
- [ ] Does every task have a default-FAIL completion contract?
- [ ] Are permissions scoped to the minimum the task needs?
- [ ] Can you delete any of this after the last model upgrade?
- [ ] Can you afford to run this loop on every task?
