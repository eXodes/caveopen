---
description: Gather external knowledge into §R so build grounds in facts, not hallucinations. Every finding cites a source.
argument-hint: "[topic | \"best lib for X\"]"
---

Invoke the **research** skill. Treat `$ARGUMENTS` as
the topic. Scope it to concrete questions, gather from primary sources (spawn a
sub-agent for big sweeps so raw pages never touch this context), distill each
answer to one caveman §R row + its source, and hand the rows to spec. Flag any
unverified finding `?` — never write a guess as fact.
