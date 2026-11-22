# Phase 4: grounded demo video

Run `liftoff video script --json` for the agent brief, product name, captured media,
shots and doctor capabilities. The CLI never writes copy with an LLM and never calls
a TTS API. You, the agent, author `.launch/video/script.json`:

```json
{"scenes":[{"shot":"dashboard.png","text":"See the whole workflow","duration":5,"voiceover":"See the whole workflow in one place."}]}
```

Expand to 6–10 scenes, 27–57 seconds of scenes (30–60 seconds including the automatic
3-second end card), with 1–8 words of on-screen text per
scene. Every shot must be an existing PNG/JPG/WebM/MP4 under `.launch/media`, or
a shots.yaml id with captured media of that name. Never use generated images as
demo footage. Provenance is the agent's responsibility: files alone cannot prove
that footage came from the real product. Run `video script` again to validate.

Phase-3 captures in `.launch/media/shots/` are discovered alongside root media;
reference them as `shots/<id>.png` or by their shots.yaml ID. Generated promotional
cards in `.launch/media/images/` are not discovered as demo footage. Phase-3
terminal manifests retain terminal framing instead of gaining browser chrome.
Privacy redactions already present in a capture remain intact in the video.

To record, mark shots.yaml entries `record: true`; keep the existing route,
viewport, actions and optional waitFor. Install Playwright and Chromium locally,
then `liftoff video record --url http://localhost:3000 --json`. Recording performs
the supplied actions against that URL; use safe local demo data, never posting
or submitting anything externally. Recordings go to `.launch/media/<id>.webm`.

If an ElevenLabs or other TTS MCP is connected, use it yourself to generate each
scene's optional voiceover line into `.launch/video/vo/0.wav`, `1.mp3`, etc.
Indices are zero-based. No connected TTS? Skip audio: captions and SRT still ship.
Rendering trims VO to scene durations, positions it on the scene timeline and
normalizes the mix toward -14 LUFS. Check the result; sparse VO can differ from
the target. Credit only **Aditya** in metadata.

`liftoff video render --renderer auto --format 16x9,9x16,1x1 --json` exports the
demo, vertical short and square video plus captions.srt. Auto uses a local or
PATH/local Remotion CLI if available, otherwise ffmpeg. Explicit
`--renderer ffmpeg` works without Remotion installed. Requires ffmpeg/ffprobe
with libx264 and librsvg (SVG rasterization). Both renderers use the same generated
gradient plates, browser/phone frames, shadows, large wrapped captions and safe
areas. Captions fade in/out; a small centre-top zoom keeps the full capture visible.
Portrait and square browser shots automatically trim near-uniform background
margins with padding before fitting the window. Video crops union the content
bounds across the first four sampled seconds, preserving navigation content.
Small isolated corner overlays (such as a development-server badge) are ignored.
Uniform/complex-background captures keep their original bounds. Landscape, phone,
and terminal shots are unchanged by this content crop.
Portrait captures in a landscape/square video include a magnified detail alongside
the complete phone, rather than throwing away the rest of the screen. A captured
terminal can opt out of browser chrome via `.launch/media/manifest.json` with
`{"frame":"terminal"}`. Both renderers append a dedicated 3-second gradient end
card with the product name, description/oneLiner, homepage URL (product metadata
or package.json), and optional `.launch/media/logo.*` (PNG/JPG/JPEG/WebP/SVG), or
a generated monogram. SRT covers only the footage scenes.

The independent project is bundled at `templates/video/remotion/`. Install its
dependencies in your working repository to use it (Remotion is not a CLI runtime
dependency). If Remotion skills are installed (see doctor), read them before
customizing scenes/camera moves. The CLI prepares shared layout/caption/end-card
PNGs and supplies them as composition props. Default motion is a gentle zoom
because the shared scene schema does not carry click coordinates. Keep real
footage in the frame. No generated product imagery.

`liftoff video check --json` verifies dimensions, duration (Shorts ≤60s, X ≤140s,
Product Hunt ≤180s), render caption receipt plus matching SRT, and audio loudness
when audio exists. It also reports G0 moves (clean decode and sampled frame diff),
G1 no-black (blackdetect), G2 no-freeze (no hold longer than 3 seconds), G3 readcheck
(generated hooks target 3 seconds, extended only to their minimum reading time),
(text ≥0.5s + words/3, voiceover ≤2.8 words/s, SRT scene cue map), G4 no-page-chrome
(no counters or progress markers), G5 end-card (3s ±0.25), and G6 voice-stt (≥80%
normalized script word coverage via local whisper or whisper-cli on scene-aligned
audio extracted from that format's exported video, never local voice takes). STT is skipped
if audio or a transcriber is missing; loudness is skipped without audio (music-only
beds retain their quieter-than -20 LUFS rule; voice targets -14 ±2 LUFS). Each gate
has id, name, status and detail. Per-format reports are saved to
`.launch/video/check.json` before failed gates throw; skipped gates never fail.
`video script` includes informational `readcheck`. Both renderers gently push in
the whole scene to avoid static holds, and plates carry no scene counter.
The receipt is evidence of the renderer's caption operation,
not an OCR check. Watch the final video before publishing. Bare `liftoff video`
renders and checks; nothing is posted. Every command supports `--json` and fails
non-zero for validation/tool failures.

Checks report duration compliance for every platform, but enforce only the mapped
targets: 9x16 → YouTube Shorts, 1x1 → X, 16x9 → X and Product Hunt.

## Style presets

`video styles --json` lists midnight (unchanged default), paper, neon, brutalist,
warm and mono, and writes `.launch/video/styles.html` with SVG still previews.
Set optional `script.json.style`. STYLE.md frontmatter carries palette gradient
stops/text/accent/caption background, typography family/weight/case, pacing min/max,
cut/fade/slide transition, static-push/push-in/pan camera and top/bottom/center
caption position. Read its Markdown story/rhythm direction before scripting.
Explicit non-default styles enforce scene pacing rather than retiming footage;
the three-second end card is fixed. Captions must retain ≥7:1 contrast.

`video styles --fork <id> --as <new>` copies a preset into
`.launch/video/styles/<new>/STYLE.md`. Local ids override built-ins. Edit at least
four of six axes from its declared base, not just the name or direction.
`video styles check` validates this; `video check` includes a `style-distinct`
gate for selected custom styles. Fresh forks deliberately fail until customized.

Selftest uses the small real captures bundled under `templates/video/footage/`
only when phase-3 captures are absent. Each fixture's manifest records the capture
date and routes/commands. SaaS includes a real pricing-link navigation recording;
mobile uses its real SVG asset rasterized in Chrome; CLI images contain actual
Tasklight command stdout, not fabricated output. Captions come from fixture product
copy. No source fixture is modified by captures or selftest.
