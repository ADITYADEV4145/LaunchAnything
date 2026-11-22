# Blind test: Liftoff vs plain Claude

Goal: 3–5 developers each see two unlabeled versions of the Show HN post and the X thread, one from plain Claude and one from Liftoff. Liftoff passes when it wins at least 4 of every 5 votes on each post (80%, with at least 3 testers).

Only real developers vote. Never fill in answers yourself, from a model, or from memory. If you cannot recruit 3 people, the test has not run.

## 1. Write Liftoff's versions

Run `liftoff write`, write `.launch/posts/show-hn.md` and `.launch/posts/x.md`, then `liftoff check` and `liftoff judge` until both pass (or are flagged after three loops).

## 2. Generate the plain-Claude versions

```bash
liftoff blind-test prepare
```

This writes `.launch/blind-test/plain-claude-prompt.md`: the exact prompt followed by the README, and nothing else.

> Write a Show HN post and an X thread for this repo.

Paste it into a fresh Claude chat with no project, files, tools or memory. Save the answers, unedited, to:

- `.launch/blind-test/plain/show-hn.md`
- `.launch/blind-test/plain/x.md`

## 3. Build the tester sheets

```bash
liftoff blind-test prepare --testers 5
```

For each tester and each post, Liftoff randomly puts its version in slot A or B and records which in `.launch/blind-test.json`. Each tester gets `.launch/blind-test/sheets/tester-N.md` with both posts as Version A and Version B, nothing else: no names, no metadata, no hint which tool wrote which.

Send one sheet per developer. Do not tell them which tool is which until they have answered.

## 4. Ask the same four questions

For each post:

1. Which would you click? (A or B)
2. Which do you trust more? (A or B)
3. What's missing from A?
4. What's missing from B?

## 5. Record the answers

```bash
liftoff blind-test record --tester tester-1 --channel show-hn --click A --trust B \
  --missing-a "no numbers" --missing-b "too long"
```

Answers go into `.launch/blind-test.json`, translated from A/B back to Liftoff/plain using the hidden order.

## 6. Tally

```bash
liftoff blind-test tally
```

Reports click and trust votes for each post and whether Liftoff reached 80% of click votes with at least 3 testers. The command exits nonzero until the test passes.

## 7. Feed it back

What testers said was missing from Liftoff's version is added automatically to the next `liftoff write` briefs and `liftoff judge` briefs for that channel. When the same gap appears twice, also add a real post that does it well to `.launch/exemplars/<channel>.yaml` and tighten the judge rubric.
