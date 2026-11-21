# Phase 4: grounded demo video

Run `liftoff video script --json` for the agent brief, product name, captured media,
shots and doctor capabilities. The CLI never writes copy with an LLM and never calls
a TTS API. You, the agent, author `.launch/video/script.json`:

```json
{"scenes":[{"shot":"dashboard.png","text":"See the whole workflow","duration":5,"voiceover":"See the whole workflow in one place."}]}
```

Expand to 6–10 scenes, 30–60 seconds total, with 1–8 words of on-screen text per
scene. Every shot must be an existing PNG/JPG/WebM/MP4 under `.launch/media`, or
a shots.yaml id with captured media of that name. Never use generated images as
demo footage. Provenance is the agent's responsibility: files alone cannot prove
that footage came from the real product. Run `video script` again to validate.

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
doctor-detected Remotion CLI if available, otherwise ffmpeg. Explicit
`--renderer ffmpeg` works without Remotion installed. Requires ffmpeg/ffprobe
with libx264 and drawtext. Captions are burned in; the last scene doubles as an
end card, so reserve it for the product name and call to action.

The independent project is bundled at `templates/video/remotion/`. Install its
dependencies in your working repository to use it (Remotion is not a CLI runtime
dependency). If Remotion skills are installed (see doctor), read them before
customizing scenes/camera moves. Default motion is a gentle zoom and pan because
the shared scene schema does not carry click coordinates. Keep real footage as
the background. A logo may be supplied to the template as the `logo` prop; put it
in public/. No generated product imagery.

`liftoff video check --json` verifies dimensions, duration (Shorts ≤60s, X ≤140s,
Product Hunt ≤180s), render caption receipt plus matching SRT, and audio loudness
when audio exists. The receipt is evidence of the renderer's caption operation,
not an OCR check. Watch the final video before publishing. Bare `liftoff video`
renders and checks; nothing is posted. Every command supports `--json` and fails
non-zero for validation/tool failures.
