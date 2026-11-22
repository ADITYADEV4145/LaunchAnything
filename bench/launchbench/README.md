# LaunchBench

**Liftoff win rate: not yet measured, pending human votes.** This directory contains
only a public product list and protocol, not votes, results or preferred posts.
These 20 real public open-source repositories are comparison subjects, not endorsements.

## Rerun

Requires the Liftoff CLI and Node.js 22+. The CLI never calls an LLM, downloads repos,
generates either version, manufactures votes, submits posts or publishes anything.

```sh
liftoff bench prepare --product vite --json
# Note the run ID and bench/runs/<runId>/vite directory.
# Repeat with --run <runId> to add products; omit --product for all 20.
```

For each product, follow `instructions.md`. Obtain the repo yourself, freeze its
revision, save its README as README.md, and document revision/model/settings in
provenance.md. Use separate agent contexts with the same model/settings:

* Plain-model context gets **only** the README and this exact prompt:
  `Write a Show HN post and an X thread for this repo.`
* Liftoff context uses the normal init → scan → product.json → validate → plan →
  brief → write → agent posts → check pipeline on that same revision. Select
  show-hn and x. Do not submit either post.

Save the actual agent outputs as `plain.md` and `liftoff.md`. Both files must have
exactly two level-two headings, `## show-hn` and `## x`, followed by nonempty posts.
Use other heading levels inside posts, and do not label the method in the text.
Record formatting changes and human edits, never secretly improve the baseline.
Existing source files and instructions are not overwritten by prepare.

```sh
liftoff bench pair --run <runId>
# Optional --seed <seed> for reproducibility; keep it private until voting closes.
```

Pairing independently assigns each product/channel's real drafts to A/B using a
random private seed (SHA-256 of seed + pair ID determines the order). The seed,
mapping and source/content hashes are in `private-key.json` (mode 0600). Only
distribute `blind/`, containing channel-specific A.md/B.md and a ballot template.
Never share the key, seed, source drafts or provenance before voting closes.
Pairing cannot remove stylistic identity cues; reviewers should not inspect source files.
Changing paired drafts requires a new run; altered A/B files cannot be scored.
Missing drafts remain pending, not filled with synthetic posts.

Each real human fills `voterId` (a stable pseudonym), `pair`, `click`, `trust`, and
`missing.A`/`missing.B`. The template includes these questions verbatim:

1. Which would you click?
2. Which do you trust more?
3. What's missing from each?

Choices are `A`, `B` or `tie`. Empty comment strings are permitted; null choices are
unfinished and rejected. A votes file has the shape below (illustration, **not a vote**):

```json
{"votes":[{"voterId":"YOUR_PSEUDONYM","pair":"vite:show-hn","click":null,"trust":null,"missing":{"A":"","B":""}}]}
```

```sh
liftoff bench record --run <runId> --votes ./completed-human-ballots.json
liftoff bench score --run <runId> --json
liftoff bench run --run <runId> --json
```

Record imports only supplied ballots and rejects unknown pairs, invalid choices and
duplicate voter/pair entries (including duplicates across imports). It cannot verify
that IDs are independent humans. Do not submit generated/synthetic/test ballots as
human votes. Test data lives only under `tests/fixtures/`, never here. Local runs,
private keys, comments and voter IDs are gitignored under `bench/runs/`.
Keep imports single-writer: these local commands do not provide concurrent-writer locking.

`run` performs prepare → pair → score on the requested/latest run; absent drafts are
left pending. Without any run it creates one. `score` with no votes exits 0 with
`measured:false`, null win rate and null interval, explicitly not a 0% result.

## Metric and disclosure

The primary win rate is Liftoff **click preference** wins / decisive click ballots,
overall and by channel. Ties count toward voteCount but not the denominator. Trust
preference is reported separately. productsCovered counts distinct products with
ballots; missing comments are retained verbatim and not numerically scored.
The 95% Wilson interval uses z=1.959963984540054 on decisive ballots. It is a
descriptive binomial interval, not proof of significance: repeated voters/products
are correlated, the sample is not representative, and the CLI cannot authenticate
voters or enforce blinding/context separation.

Before publishing a result, disclose participating products, run/revisions, model
settings, prompt and edit protocol, pair count, independent human count, vote count,
ties, per-channel coverage, exclusions and uncertainty. Publish de-identified ballots
and reveal the key after voting closes only with participants' consent. Never call
unvoted drafts “human-preferred” or turn fixture test outcomes into benchmark results.
