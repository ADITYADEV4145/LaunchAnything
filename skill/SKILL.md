---
name: liftoff
description: Prepare a grounded, human-approved product launch from a repository. Foundation placeholder; pipeline phases are not yet implemented.
---

# Liftoff

Run `liftoff doctor --json` to discover optional skills, MCP servers and tools.
Run `liftoff selftest --through 1 --json` to check the installed foundation.

The agent is the model; the CLI never calls an LLM API.
Future stages: init → scan → validate → plan → write/check → shots/images →
video → review → publish → results/learn/receipt.

Pipeline commands currently exit 2 with a phase-specific not-implemented error.
Do not claim a launch was prepared or published by these placeholders.

Every product claim needs a source. Publishing requires human approval of the exact
post and media. Never auto-post to Hacker News or Reddit and never auto-reply.
Optional integrations must have a fallback. Keep detailed phase instructions in references/.
