# Ground a product in repository facts

After scan, read `.launch/scan.json` and inspect the actual referenced files. The
agent writes `.launch/product.json`; the CLI does not generate prose or call an LLM.

Required fields (see schemas/product.schema.json):

- name: product name, not a campaign slogan.
- oneLiner: at most 80 characters.
- audience: who uses it; label inferred positioning conservatively.
- problem: the concrete problem its current implementation addresses.
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
