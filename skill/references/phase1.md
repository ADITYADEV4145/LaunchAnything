# Phase 1 behavior and extension points

## Detection and confirmation

Precedence: package.json bin → devtool; expo/react-native dependency → consumer-mobile;
next/react plus a pricing page in app/ or pages/ (including src/) → indie-saas;
otherwise devtool as a conservative fallback. We intentionally do not infer B2B from
the word team or an enterprise pricing tier; use --profile b2b-saas or enterprise
after human confirmation. Bin metadata takes precedence for dual-purpose repos.

Init without --profile or --yes saves profileConfirmed:false and a confirmation
message. An explicit --profile selects the profile; --yes accepts detection. A saved
unconfirmed profile can be confirmed with --profile <p> --yes, preserving date,
timezone and other settings (channels reset to that selected profile's defaults).
All other existing configuration is preserved without --force. Plan requires a
confirmed profile. Init defaults to today's UTC date and the system IANA timezone;
pass both explicitly for repeatable launches.

## Offline scan

Scan skips dependency/build/state directories and symlinks. It records README sections,
package metadata, LICENSE text, URL routes (CLI commands remain source paths), media candidates and commits
after the nearest reachable tag. With no tag it uses all commits; with no Git history
it uses an empty list. README HTTP(S) links are fallback landing URL candidates;
inspect the result because a README's first URL is not necessarily a landing page.

Next app routes come only from page.* and route.* files, with route groups and
parallel slot names removed and private _folders excluded. Pages routes omit API
handlers and framework pages (_app, _document, _error). Expo dependencies select
Expo file-based routing instead, including index and named screens but not layouts.

GitHub stars are fetched only with --github or LIFTOFF_ALLOW_NETWORK=1, from a standard
GitHub origin remote. No tokens are sent. Only a public repo response contributes a
star count; missing/private repos and network errors do not fail the scan.

## Planning

Plan respects configured channel order, filters against profile defaults and channel
profiles, then selects 4 for new-product, 3 for feature/relaunch and 2 for changelog.
At least two allowed channels are required. Each channel gets its first bundled
posting time on the next allowed weekday on/after launchDate. All times are local
wall-clock times in config.timezone, not UTC timestamps. Lead times are preparation
guidance, not a claim that past preparation has already happened. --date overrides
the plan's date without changing config.json. The T checklist is relative to the
launch date; some channel slots may land later on an allowed weekday.

Phase 6 hook: src/planning/plan.ts exports createPlan(config, {date?, lessons?})
and plan(cwd, options). Supply lessons as {channel, time: HH:mm, observation}[]
after loading history externally. Only selected channels are affected; the plan
explicitly records each changed time and observation. Phase 1 never reads home
history implicitly. Keep observations factual and do not imply causation.
