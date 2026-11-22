# Ground a product in repository facts

After scan, read `.launch/scan.json` and inspect the actual referenced files. The
agent writes `.launch/product.json`; the CLI does not generate prose or call an LLM.

Required fields (see schemas/product.schema.json):

- name: product name, not a campaign slogan.
- oneLiner: at most 80 characters.
- audience: { who, where?, uses? }; who uses it, researched communities, and tools they already use.
- problem: { summary, pains? }; the concrete problem and up to three pains grounded in research/pains.json.
- proofPoints: 3–5 factual strings, supported by the repository; no invented metrics.
- features: nonempty array of {name, description, sources}.
- claims: nonempty array of {id, text, sources}; ids must be unique and reusable by
  later post citations. Use stable identifiers such as local-task-list.
- Each sources array must contain at least one {type, ref}. Type is file, commit or url.

File refs are repository-relative existing files, not line fragments or directories.
Paths escaping the repo (including escaping symlinks) fail. Commit refs are 4–40 hex
characters and must resolve to a commit locally; unresolved commits warn because a
checkout may be shallow. URL refs must use HTTP(S); validation does not fetch them.
Do not cite a URL as evidence unless you have actually inspected its content.

Example feature and claim:

```json
{
  "features": [{
    "name": "Local task list",
    "description": "Add and list tasks from the terminal",
    "sources": [{"type": "file", "ref": "bin/tasklight.js"}]
  }],
  "claims": [{
    "id": "local-task-list",
    "text": "Add and list tasks from the terminal",
    "sources": [{"type": "file", "ref": "bin/tasklight.js"}]
  }]
}
```

This fragment is not a complete product document; add all required top-level fields.
Run `liftoff validate product --json` until errors are fixed. Schema validation proves
structure and local file existence, not that a source actually supports the prose;
the agent must check that relationship. Each proof point should have a corresponding
sourced claim so later phases can cite it.

## Benchmark-backed product inputs

Before `liftoff write` or `liftoff brief`, product.json must validate. Use `problem: { summary, pains? }` (up to three researched pains with pain_index and exactly two source quotes), `audience: { who, where?, uses? }`, and `money_moment: { before, action, after }`. Communities and competitors are checked against local research when present. Existing proofPoints, features and claims remain required.

Configure `proof.benchmarks` in .launch/config.json with a slug name, optional command and 1–3 repos, results JSON path, and metrics (`metric`, `pointer`, `unit`, `context`). Run `liftoff proof run` (`--skip-run` reads recorded results; `--timeout <s>` defaults to 1800). `{repo}` is substituted in commands and result paths. No benchmarks? The command writes .launch/proof/plan.md and exits non-zero. It never invents measurements.

Paste emitted metrics into the required product.json `proof` array. Each includes `metric`, `value`, `unit`, `context`, `source_file` and an RFC 6901 `source_pointer`. Validation requires a schema-valid `.launch/proof/<name>.json` record, resolves the pointer within its `/results` subtree, and requires exact value equality. If the original results file is present, its SHA-256 must still match the record; otherwise rerun `liftoff proof run`. Do not type or fabricate benchmark values. Run `liftoff validate product --json`; errors block writing and brief generation.
