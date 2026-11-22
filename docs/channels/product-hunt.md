# Product Hunt

## What Liftoff does and why

Title is the tagline (60-character local budget); body is a warm first-person maker comment. Include the required `## Maker comment` heading. The local gallery policy recommends at least two images at 1270 × 760; verify manually.

Eligible planning profiles: `indie-saas`, `b2b-saas`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **7 days**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **60 characters**. Body **1–2000 characters**; at most **3 links**. No mandatory link field.
- Title is the tagline (60-character local budget); body is a warm first-person maker comment. Include the required `## Maker comment` heading. The local gallery policy recommends at least two images at 1270 × 760; verify manually.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel product-hunt` for an agent brief, write `.launch/posts/product-hunt.md` with valid YAML front matter, then `liftoff check --channel product-hunt`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

Normal publish creates local paste files and reminders. Optional browser assist fills forms using your own profile, but a human must submit. HN and Reddit are never auto-submitted; Product Hunt is also never auto-submitted. The official PH MCP route can create an **unsubmitted draft**, check readiness and save a preview. The human reviews/adds attachments on Product Hunt and submits. Planned wall time is converted to an America/Los_Angeles launch day, with local 24h/1h reminders.

## Troubleshooting

### Approval and local staging

- `<channel>: exact post and media hash not approved (new or edited post)` means the source or media changed; review and approve the exact current hash again. Configured approvers can also produce `<channel>: missing approval from <name>`.
- `No matching approved posts to assist` means the selected channel has no eligible non-skipped posts; check channel selection, drafts and review decisions.
- Normal `publish` is a preview; `publish --confirm` writes local paste files, attachments and receipts, not external posts. Inspect the destination before retrying a failed assisted attempt: after two dispatch failures Liftoff retains a manual paste file rather than silently retrying forever.

### Browser route (human presses Submit)

The browser fills an owned Chrome profile's form and waits for a human-submitted result URL. It never clicks Submit. Local attachments are staged temporarily and cleaned up. HN/Reddit have a one-per-day local cap; PH also has a one-per-day cap. Caps count reservations, including failed attempts, not just successful posts.

Browser connections use your Chrome profile, not an API token or OS-keychain credential. Token/keychain errors apply to API/MCP routes, not browser login.

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.
- `Browser connections require --profile pointing to your Chrome user data directory`: reconnect with your owned Chrome profile path.
- `Submit must never be automated`: the driver intentionally refuses submit/button selectors. Submit yourself; do not bypass this guard.
- `Timed out waiting for user submission` is the mock driver's error for no matching submitted URL; the real Playwright driver may raise its own timeout. Complete submission yourself and inspect the destination before retrying.
- `<channel>: daily cap reached` (Reddit adds `; never more than one subreddit per day`): wait for a new UTC day; never fan out to multiple subreddits.

### Official MCP route

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Token required via --token-env or stdin`: provide a nonempty token through an environment variable or stdin, never a command-line literal.
- `OS keychain unavailable or access denied; no token was stored`: unlock/fix your OS keychain backend. Tokens are not saved in the connection JSON.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.
- `MCP token unavailable; reconnect your own account`: the OS keychain has no matching token.
- `Official MCP request failed; reconnect your own account`: official endpoint returned a non-OK HTTP response; inspect credentials/service availability.
- `Invalid official MCP response`: malformed RPC response or incomplete SSE stream; inspect endpoint/protocol compatibility.
- `MCP tool refused: only verified draft, readiness and preview tools are allowed; never submit or publish`: deliberate allowlist protection, not permission to try an unfamiliar write tool.

- `Product Hunt MCP requires a product link`: set an HTTP(S) product link in front matter.
- `Required official PH draft tools unavailable`: official tools/list lacks start_launch, get_launch or get_launch_preview_view; retain manual staging.
- `PH did not return an unsubmitted draft`, `PH readiness check unavailable`, or `PH preview unavailable`: the returned draft/readiness/preview shape is not safe/complete; inspect the official UI before retrying.
- `Invalid PH draft URL`: response URL is not HTTPS on producthunt.com; never follow an unexpected draft destination.
- `Product Hunt requires name, tagline, description and launch date`: browser payload is missing required content or an ISO date.

## Sources

- [Planning policy](../../rules/channels/product-hunt.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/product-hunt.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).

[All channels](README.md)
