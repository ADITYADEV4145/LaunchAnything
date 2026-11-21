# Phase 0: pain research

The CLI fetches evidence, not conclusions. No LLM calls occur.
`liftoff research "idea" --json` fetches an initial query and returns next steps;
it cannot truthfully create human pain clusters on its own.

1. Derive 8–15 queries: problem words, competitor names, "I wish", "alternative
   to", "why is X so", task frustration, missing feature and workaround phrases.
2. Run `liftoff research fetch --file queries.json --json` (JSON string array or
   one query per line); positional queries also work. Get human permission first.
3. Read `.launch/research/raw/`: raw responses and normalized items are cached by
   source + query. Cache hits make zero network calls, even without credentials.
   Remove a specific cache file only when deliberately refreshing it.
4. Cluster evidence and write `.launch/research/pains.json` using
   `schemas/pains.schema.json`. Include idea, pains and competitors. Each pain
   needs name, description, mentions, intensity (1–5), date_range start/end,
   3–5 quotes {text,url}, current_tools and shortcomings. Quote at most 25 words,
   verbatim, with at least three independent authors/items. Do not equate three
   comments from one author with three independent sources. Count deduplicated
   mentions, not search hits. Optional solution_feature names a product feature.
5. Run `liftoff research check --json`; fix every failure. Run
   `liftoff research report --json` to write pain-report.md. Links are allowed,
   usernames in visible report text are not. Rephrase descriptions, but never
   edit quotations to evade the check. Select another quote if needed.

HN Algolia and Stack Overflow are public. GitHub searches the top five related
repositories by stars for issues and discussions; GITHUB_TOKEN raises limits.
Reddit requires REDDIT_ACCESS_TOKEN from the user's own OAuth app. Without it,
use the agent browser on reddit.com search; the CLI does not scrape Reddit.
Browser-only evidence must not be presented as API-verified cached evidence.
PRODUCT_HUNT_TOKEN enables comments on matching recent launches (first 50).
APP_STORE_ID enables App Store reviews. GOOGLE_PLAY_PACKAGE and
GOOGLE_PLAY_ACCESS_TOKEN enable the official review API for authorized apps;
competitor Play reviews need the agent browser. X_BEARER_TOKEN must be from the
user's paid X API account. Absent credentials are reported as skips, not errors.
Never put tokens in query files or caches. HTTP failures/rate limits stop the
fetch; honor the retry/reset information before rerunning. Partial completed
queries remain cached. Results are bounded first pages, not exhaustive crawls.

The report ranks mentions descending, then intensity; both are agent-supplied
evidence assessments. A solution_feature exact match in `.launch/product.json`
fills "What we do about it"; all other pains say "not solved yet". Later phases
can import painsPath/loadPains from src/research/index.ts.
