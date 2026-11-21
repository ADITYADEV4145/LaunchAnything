# Pre-launch checks

1. Run `liftoff init` if you need launch channels and then `liftoff prelaunch --init`.
2. In a clean test environment, verify the install takes one command, try the
   public demo signed out, and complete the main product flow. Record each result
   and what you tried in `.launch/prelaunch.json`. Do not include secrets or user data.
3. Save rendered landing HTML and supply its repository-relative path in
   `landingSnapshot`. At the target viewport, record whether the demo is visible
   on initial load in `demoAboveFold`. Enter a representative mobile run’s measured
   Largest Contentful Paint in `landingLcpMs`. Leave unmeasured values as `null`.
4. Run `liftoff prelaunch --json`, review the generated artifacts, and rerun after
   fixes. The JSON report is available even when the readiness score fails.

The CLI does not install the project, browse, send email, or make API calls.
It scores recorded evidence out of 100: install 30, demo 30, main path 40.
The default threshold is 80 and can be set to 70–100. Starting pre-launch checks
enables the gate for that kit: `publish --confirm` reads the current evidence
and refuses staging below the threshold. Dry-run and exact-content approval
requirements are unchanged. Older kits without pre-launch evidence still work.

## Input options

| Fields | Use |
| --- | --- |
| `installCommand` | Verified one-line install command; checked against README documentation, never executed. |
| `readme`, `faqPath`, `gettingStartedPath` | Optional paths; defaults are `README.md`, `docs/faq.md`, and `docs/getting-started.md`. |
| `landingSnapshot`, `demoAboveFold`, `landingLcpMs` | HTML snapshot and recorded viewport/speed measurements. The LCP target is 2.5 seconds. |
| `demoUrl`, `ogImageUrl` | Optional known URLs for suggested edits. |
| `feedbackUrl` | Optional active GitHub Discussions or Discord invite to link in the README. |
| `landingUrl`, `campaign` | Destination and a campaign slug (lowercase letters, digits, hyphens or underscores). |
| `waitlist.provider`, `waitlist.action` | `resend`, `loops`, or `kit` (ConvertKit) and an app-owned route such as `/api/waitlist`. Omit the object to disable the draft. |

## Artifacts

Artifacts are in `.launch/prelaunch/`:

- **report.json**: readiness results, heuristic checks for the README and HTML,
  and support status. Audit warnings do not count toward the three readiness checks.
- **suggested-fixes.diff**: review with `git apply --check`, then apply only the
  changes you want. Transfer snapshot changes to the actual page source. Fill in
  TODOs and remove the support draft marker only once the documentation is useful.
- **tracking-links.json**: one UTM URL per channel in the launch config. Put the
  matching URL in each post draft before requesting approval; no draft is edited
  automatically. Attribution requires analytics on the destination.
- **waitlist.html** and **welcome-email.txt**: reviewed drafts, not a hosted
  service. Implement the same-origin server route separately, keep provider
  credentials server-side, and test consent, deduplication, and unsubscribe handling
  with mocks before deploying. Liftoff never embeds the form or sends email.
