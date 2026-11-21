# Phase 3: proof in pixels

Read product.json features and sources, then draft .launch/shots.yaml with one shot per proof point. Use stable selectors, realistic synthetic data and explicit viewports. Never use real customer credentials. Put sensitive selectors in config.redact; blurring does not excuse unredacted secrets elsewhere.

For web shots set baseUrl or pass --url, or provide startCommand (default npm run dev on port 3000). Each shot needs id, route and viewport; optional actions use click/type/wait with selector and text. theme, waitFor, fullPage and record are optional. Terminal shots replace route with commands, run locally, and always generate a PNG and animated GIF. Review commands before executing them.

If Playwright MCP is installed, use it to discover selectors and rehearse interactions, then save the reproducible shot list and run liftoff shots. The bundled Playwright runner is the fallback. Install Chromium with npx playwright install chromium if no local Chrome exists.

If frontend-design is installed, ask it for a launch-specific HTML template in .launch/media/images/custom/index.html. Use {{headline}}, {{title}}, {{screenshot}}, {{logo}}, {{background}}, {{foreground}}, {{accent}}, {{headingFont}}, {{bodyFont}} and {{frame}} substitutions. Mark the headline with data-headline, use an opaque background, keep it within 5% margins and away from YouTube's bottom-right timestamp region. Templates must be self-contained; network requests are blocked. Otherwise liftoff images uses six bundled templates. Brand kits are optional JSON with colors, fonts and optional local logo.

Run liftoff shots --json, then liftoff images --json. Inspect shots/manifest.json and images/report.json under .launch/media, and visually review the PNGs/GIFs before proceeding. Privacy failures list only pattern names. Optional local Tesseract OCR is recorded per shot. No command calls an LLM or publishes media.
