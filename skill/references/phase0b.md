# Phase 0b: pre-launch audience

Everything in this workflow stays local. A draft, a permission note, or an approval
is not a send action. There is no Kit API, live form, subscriber sync, or posting adapter.

1. Complete [phase 0](phase0.md). Run `liftoff audience prepare --json` after the pain
   evidence checks pass. It reads the Pain Report's structured source
   `.launch/research/pains.json` and rechecks its cached sources without fetching.
2. Read `.launch/audience/community-map.json`. Each suggested community has links
   to the pain evidence behind it. Reddit subreddits, GitHub repositories, and
   Hacker News map to community discussion venues; other source links remain
   research-only. A source link is not an invitation to message its author.
3. Edit the JSON drafts in `.launch/audience/drafts/`. For outreach, write one
   tailored, useful discussion for the venue, disclose your affiliation, and add
   `"permission": {"rulesUrl": "https://…", "note": "…"}` only after a human has
   checked that the community allows the proposed discussion. Keep blocked drafts
   private. No cold DMs, bulk outreach, copy-paste across communities, or vote requests.
   For build-in-public, say what happened or what you learned, not what you hope
   someone will assume. Replace scaffold copy only with true, sourced updates.
4. Run `liftoff audience review --json` to check the drafts and show their content,
   destination, approval status and SHA-256. Once a named human has reviewed the exact
   content, they can record the decision with
   `liftoff audience approve <id> --hash <sha256> --by <name> --json`.
   Editing the draft invalidates its approval. Preparation preserves draft edits;
   if the research changes, update outreach evidence and remove obsolete drafts.

## Kit (formerly ConvertKit)

Edit `.launch/audience/kit/setup.json` for the headline, description and opt-in
copy, then rerun prepare to rebuild the disabled `preview.html`. This is a local
setup draft, not a live Kit landing page, and does not collect addresses.

To stage addresses already opted in to this waitlist, keep an input file under the
repository's ignored `.launch/` directory. It must be a JSON array, for example:

```json
[
  { "email": "reader@example.test", "consent": true, "consentedAt": "2025-01-01T00:00:00Z" }
]
```

Run `liftoff audience import-signups .launch/opt-ins.json --json` to merge opted-in
addresses case-insensitively into `kit/signups.json`. Do not import scraped contacts,
unsubscribes or addresses from pain research. Run `liftoff audience export-signups --json`
only if a local Kit-format `kit/kit-import.csv` is needed for review. Keep both files
private. These commands never upload, sign anyone up or send a welcome email.
