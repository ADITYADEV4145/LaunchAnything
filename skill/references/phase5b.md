# Own-account connections

Use `liftoff connect --list` to inspect non-secret connections. Connect social accounts
with `--route postiz` or `--route buffer`; Dev.to and GitHub Releases use `--route api`.
Supply tokens through `--token-env NAME` or piped stdin. Tokens are stored in the
OS keychain only; missing keychain tools cause refusal, never a file fallback.

For HN, Reddit and Product Hunt, connect with `--route browser --profile PATH` and
your own account handle. Close other Chrome instances using that profile first.
After review approval, `liftoff publish --confirm --assist show-hn` opens and fills
the form. Review it and press Submit yourself. Liftoff watches for the resulting
post URL and records it. It has no click/submit operation. Browser form selectors
may need maintenance when platforms change their UI.

The default publish command remains an offline paste kit. API/MCP connections are
recorded but live API/MCP dispatch is not yet configured; assisted publishing
refuses these routes rather than pretending to publish.

Caps use UTC days and count attempts conservatively, including browser failures:
HN, Reddit and Product Hunt allow one per day; X five; others two. Reddit is
limited across all accounts and subreddits. Never delete the cap ledger to retry.
Assisted calendar files carry an open-and-fill command; Product Hunt reminders
use 00:01 America/Los_Angeles and alarms 24 hours and one hour before.
