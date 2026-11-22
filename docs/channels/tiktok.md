# TikTok

## What Liftoff does and why

Use a short demonstration caption (2200-character conservative editorial budget) and real vertical footage. The source returned navigation only, not verified caption numbers.

Eligible planning profiles: `consumer-mobile`. Plan selection keeps channels aligned with the repository profile instead of blindly cross-posting everywhere. All channels use agent-written, source-grounded copy; the CLI never calls an LLM.

## Rules, timing and format

- Planning windows: Tuesday, Wednesday, Thursday at **09:00 or 14:00** in config.timezone; lead time **1 day**. These are starting heuristics, not platform performance promises. Planning chooses a window and writes plan.md; it does not schedule an external post.
- Required title; maximum **100 characters**. Body **1–2200 characters**; at most **1 links**. No mandatory link field.
- Use a short demonstration caption (2200-character conservative editorial budget) and real vertical footage. The source returned navigation only, not verified caption numbers.
- Numeric budgets are local editorial enforcement unless explicitly supported by the YAML verification notes. Most are unverified, not platform guarantees; subreddit/platform rules override them. Shorts title/description and email subject guidance have source-backed fields, not blanket verification.
- Run `liftoff write --channel tiktok` for an agent brief, write `.launch/posts/tiktok.md` with valid YAML front matter, then `liftoff check --channel tiktok`. Use `liftoff review` and approve the exact post/media hashes before local staging or assist.

## Automated vs manual

Liftoff prepares briefs, checks grounded copy and creates local media/paste payloads. Postiz/Buffer (or selected Ayrshare) adapters currently stage files offline, not external schedules. A human transfers and publishes the reviewed kit.

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

## Sources

- [Planning policy](../../rules/channels/tiktok.yaml): profiles, days, time windows and lead time.
- [Platform policy](../../rules/platforms/tiktok.yaml): exact limits, guidance, external source URLs and verification caveats. Consult those linked upstream sources for current platform rules.
- [Connection registry](../../src/connect/registry.ts), [assisted dispatch](../../src/connect/publish.ts), [offline adapters](../../src/adapters/index.ts).
- [MCP guards](../../src/connect/mcp.ts), [browser guards](../../src/connect/browser.ts), [forms](../../src/connect/forms.ts), [payloads](../../src/connect/payloads.ts), [caps](../../src/connect/caps.ts), [keychain](../../src/connect/keychain.ts).

[All channels](README.md)
