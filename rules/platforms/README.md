# Platform post rules

Phase 2 owns per-platform copy constraints in this directory. Channel scheduling defaults live separately in ../channels/. Times are starting heuristics in the configured timezone, not platform guarantees; revisit them using launch results.

The phase-2-owned validator is src/copy/platforms.ts, not the shared rules schema.
These budgets deliberately prefer short copy; guidance labels editorial limits.
Sources are reference documentation, not live network checks. Reverify platform
policies before publishing. Reddit subreddit policies, gallery dimensions, media
readiness and live link availability require human review.

Source pages were fetched on 2026-11-21. lastVerified is null when no constraint
value was confirmed; otherwise it dates only verifiedFields. verified: false
means the whole rule is not verified. verificationNotes distinguish source facts
from local budgets. Subreddit policies are explicitly unverified local gates;
blocked rule pages must not be treated as evidence of live moderator policy.
