# Parallel ownership

Shared contracts are stable foundation files: src/core/*, src/commands/index.ts,
src/cli.ts, schemas/*, rules/profiles/*, rules/channels/*, package.json and configs.
Coordinate changes to those with the lead rather than editing them concurrently.

| Phase | Command modules in src/commands/ | Other owned paths |
| --- | --- | --- |
| 0 | research | src/research/, schemas/pains.schema.json, src/selftest/phase0.ts, tests/phase0.test.ts |
| 1 | init, scan, validate, plan | src/product/, src/planning/, src/selftest/phase1.ts, tests/phase1.test.ts |
| 1b | brief | src/brief/, rules/brief.yaml, src/selftest/phase1b.ts, tests/phase1b.test.ts, skill/references/phase1b.md |
| 2 | write, check | src/copy/, rules/platforms/, src/selftest/phase2.ts, tests/phase2.test.ts |
| 3 | shots, images | src/visuals/, templates/images/, src/selftest/phase3.ts, tests/phase3.test.ts |
| 4 | video | src/video/, templates/video/, src/selftest/phase4.ts, tests/phase4.test.ts |
| 5 | review, publish | src/review/, src/adapters/, src/selftest/phase5.ts, tests/phase5.test.ts |
| 5b | connect | src/connect/, src/selftest/phase5b.ts, tests/phase5b.test.ts, skill/references/phase5b.md |
| 5c | adapters | src/core/registry.ts, rules/adapters/, schemas/site.schema.json, tests/phase5c.test.ts, skill/references/phase5c.md |
| 6 | results, learn, receipt | src/results/, src/selftest/phase6.ts, tests/phase6.test.ts |
| Launch ops | warroom, friends, followup, retro, release | src/launch-ops/, src/results/retro.ts, src/selftest/launch-ops.ts, tests/launch-ops.test.ts, skill/references/launch-ops.md |

Each command exports register(program). Core launchDir resolves the folder contract.
Use validateFile(kind, data), loadRule(group, id), commandOptions and output rather
than duplicating helpers. Shared type/schema changes need coordination.

Each selftest phase exports Check[]; each check receives {cwd, fixture} for its isolated
fixture repository. Throw to fail. Never write to source fixtures during a selftest.
Use phase-prefixed fixture files under .liftoff-fixture/ to avoid collisions.
The baseline product.json and expected.json belong to phase 1. Phase-specific skill
references go in skill/references/phaseN.md; coordinate changes to SKILL.md.

Foundation owns doctor, the selftest runner/registry, core helpers and foundation tests.
Do not change build/CI/config merely to support one phase without agreement.
Run npm run typecheck, npm test, npm run build and the relevant selftest gate.
No LLM API calls, auto-posting to HN/Reddit, or approval bypasses.
