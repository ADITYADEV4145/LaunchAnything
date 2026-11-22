# Own-account connections

Use `liftoff connect --list` to inspect non-secret connections. Connect social accounts
with `--route postiz` or `--route buffer`; Dev.to and GitHub Releases use `--route api`.
Supply tokens through `--token-env NAME` or piped stdin. Tokens are stored in the
OS keychain only; missing keychain tools cause refusal, never a file fallback.

For HN and Reddit (or the Product Hunt fallback), connect with `--route browser --profile PATH` and
your own account handle. Close other Chrome instances using that profile first.
After review approval, `liftoff publish --confirm --assist show-hn` opens and fills
the form. Review it and press Submit yourself. Liftoff watches for the resulting
post URL and records it. It has no click/submit operation. Browser form selectors
may need maintenance when platforms change their UI.

Product Hunt defaults to the official MCP at `https://mcp.producthunt.com/mcp`.
Supply your own authorized MCP access token via the keychain setup above. After
hash approval, assisted publishing calls only `start_launch`, `get_launch` and
`get_launch_preview_view`: draft, readiness assessment, preview. `start_launch`
is safe because it creates an unsubmitted draft, not a public launch. Both real
and mock clients reject all other tools, including submit/publish operations.
The preview and blockers are retained under `.launch/review/mcp/<hash>/`;
add local attachments and submit yourself on Product Hunt. A draft receipt is
manual, never reported as a live published post. Browser fallback remains available.

X defaults to the official MCP at `https://api.x.com/mcp`. Capability discovery
does not authorize arbitrary advertised write tools. No ordinary post-create
contract is verified in `https://docs.x.com/tools/mcp`, so X currently fails
closed after discovery: no guessed tool name, no write call, retained paste file.
Tests and selftest use injected MCP mocks only, never these network endpoints.

The review page shows X cost before approval. Official defaults from
https://docs.x.com/x-api/getting-started/pricing are $0.015 per Post: Create
request and $0.20 with a URL. They are estimates, not an automatic charge;
threads/media may cost more and rates may change. Override `.launch/config.json`:

```json
"xApiCost": { "create": 0.015, "withUrl": 0.20 }
```

Use `null` for a rate to display “cost unknown — set it in config”. Negative or
non-numeric rates are rejected. Postiz/Buffer X routes remain available.

LinkedIn accepts only `postiz`, `buffer`, or direct official API `api`. Browser
profiles and website-driving MCP servers are explicitly refused at connection
and dispatch. Direct API staging writes `linkedin-api-request.json` targeting
`https://api.linkedin.com/rest/posts`; it does not send the request or embed a token.

The default publish command remains a dry run; `publish --confirm` stages an
offline paste kit. Assisted publishing for
Postiz, Buffer and API connections uses the matching offline adapter to stage
paste files and manual receipts; these staging adapters never call a live API.
Instagram staging also writes `instagram-payload.json` with gallery images, the
9:16 video (identified by its path or slot), caption, hashtags and cover frame.
Use front matter `hashtags` (a string list) and optional `coverFrame` (default 0).

Caps use UTC days and count attempts conservatively, including browser failures:
HN, Reddit and Product Hunt allow one per day; X five; others two. Reddit is
limited across all accounts and subreddits. Never delete the cap ledger to retry.
Assisted calendar files carry an open-and-fill command; Product Hunt reminders
use 00:01 America/Los_Angeles and alarms 24 hours and one hour before.

Assisted dispatch retries a failed operation once within the same cap reservation.
After the second failure, `.launch/review/ready/<channel>/<hash>/post.txt`
and approved attachments remain available, with `failure.json` recording two
attempts and manual status. A warning and manual receipt in `published.json`
ensure nothing silently disappears. Inspect the destination before pasting after
an ambiguous error: a user may already have submitted. Captured browser URLs are
preserved even if browser closing fails. Live URLs use published status in
`published.json`, consumed directly by launch-day and results readers; drafts
and manual paste files are not misrepresented as published URLs.
