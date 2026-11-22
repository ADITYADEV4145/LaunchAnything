# X

## What Liftoff does and why

Use a short concrete hook followed by a thread; each post should stand alone. Separate posts with `---` on its own line. Local budgets are 280 characters/post and 10 posts/thread, counting URL characters literally.

Eligible planning profiles: `devtool`, `indie-saas`, `b2b-saas`, `consumer-mobile`, `enterprise`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **1 day**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **100 characters**. Body **1–2800 characters**; at most **2 links**. No mandatory link field.
- Use a short concrete hook followed by a thread; each post should stand alone. Separate posts with `---` on its own line. Local budgets are 280 characters/post and 10 posts/thread, counting URL characters literally.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel x` for an agent brief, write `.launch/posts/x.md` with valid YAML front matter, then `liftoff check --channel x`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

Liftoff prepares briefs, checks grounded copy and creates local media/paste payloads. Postiz/Buffer (or selected Ayrshare) adapters currently stage files offline, not external schedules. A human transfers and publishes the reviewed kit. Official X MCP discovery is available, but there is no verified post-create tool; it falls back to a manual paste file. Direct X API costs are estimates only, not charges incurred by this CLI.

## Troubleshooting

### Approval and local staging

- `<channel>: exact post and media hash not approved (new or edited post)` means the source or media changed; review and approve the exact current hash again. Configured approvers can also produce `<channel>: missing approval from <name>`.
- `No matching approved posts to assist` means the selected channel has no eligible non-skipped posts; check channel selection, drafts and review decisions.
- Normal `publish` is a preview; `publish --confirm` writes local paste files, attachments and receipts, not external posts. Inspect the destination before retrying a failed assisted attempt: after two dispatch failures Liftoff retains a manual paste file rather than silently retrying forever.

### Postiz / Buffer routes (and Ayrshare adapter selection)

Connect your own account with `--route postiz` or `--route buffer`. Both currently stage offline files through `src/adapters/index.ts`; no HTTP scheduling request is made. The normal selector can also choose the Ayrshare-named offline adapter through MCP names or AYRSHARE_API_KEY; Ayrshare is not a `liftoff connect --route` value. POSTIZ_API_KEY / BUFFER_ACCESS_TOKEN / BUFFER_API_KEY influence normal adapter selection, not proof of an authenticated publish.

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Token required via --token-env or stdin`: provide a nonempty token through an environment variable or stdin, never a command-line literal.
- `OS keychain unavailable or access denied; no token was stored`: unlock/fix your OS keychain backend. Tokens are not saved in the connection JSON.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.
- `Unsupported route <route> for <platform>` means that registry combination is not supported; use Postiz or Buffer for this channel (X also supports MCP, LinkedIn also API).
- `<adapter> cannot stage <channel>` means the selected adapter does not accept that channel. Use the channel's supported route or the manual fallback.

### Official MCP route

- `<channel>: connect your own account first with liftoff connect; use --account to disambiguate`: no unique registry match; connect your own account or pass the exact handle.
- `Token required via --token-env or stdin`: provide a nonempty token through an environment variable or stdin, never a command-line literal.
- `OS keychain unavailable or access denied; no token was stored`: unlock/fix your OS keychain backend. Tokens are not saved in the connection JSON.
- `Connection registry busy; inspect connections.lock before retrying`: another writer holds the connection lock; inspect it before retrying, do not blindly delete a live lock.
- `MCP token unavailable; reconnect your own account`: the OS keychain has no matching token.
- `Official MCP request failed; reconnect your own account`: official endpoint returned a non-OK HTTP response; inspect credentials/service availability.
- `Invalid official MCP response`: malformed RPC response or incomplete SSE stream; inspect endpoint/protocol compatibility.
- `MCP tool refused: only verified draft, readiness and preview tools are allowed; never submit or publish`: deliberate allowlist protection, not permission to try an unfamiliar write tool.

- `No verified official X post-create tool; use the retained manual paste file`: no allowlisted post-create capability is verified. Do not substitute an unknown tool. The CLI warning says `No verified official X post-create tool available. Discovery never authorizes an unfamiliar write tool.`
- `Invalid X API cost configuration`: configured numeric rate is negative, non-finite or not a number; use a nonnegative number (or null for unknown).

## Sources

- [Planning policy](../../rules/channels/x.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/x.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).

[All channels](README.md)
