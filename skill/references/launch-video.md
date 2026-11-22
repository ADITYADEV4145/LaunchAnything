# Product launch video

Make the viewer understand one benefit and see the product deliver it. Use
Liftoff's current Remotion pipeline; do not copy another skill's scaffold or
add a video generator to the CLI. [Phase 4](phase4.md) is the renderer and file
contract. Check the installed CLI's help for version-specific options.

## 1. Agree on the story before making media

- If the user asked for research, a storyboard or skill changes only, deliver
  that and stop. A hold on video production stays in effect until the user lifts
  it. Do not capture new footage, synthesize speech or render while on hold.
- Start with the launch brief and validated product facts. Confirm the audience,
  placement, one payoff, approved CTA, original logo, and narration source.
  Ask only for missing decisions or assets; don't infer brand approval.
- Study a relevant public reference for pacing, framing and the reveal, not
  for assets or copy. The [Warp Agent CLI launch](https://www.warp.dev/blog/introducing-the-warp-agent-cli-coding-agent)
  is a reference for a developer tool shown in its native environment;
  [v0's reveal](https://www.youtube.com/watch?v=By9wCB9IZp0) is a reference for
  a visible product result. Don't transplant their scenes or claims.
- Draft a shot list: **beat | real capture | sourced claim | on-screen text |
  narration | seconds**. Put the actual product within the first three seconds,
  then show the before, the action, and the result. Give the payoff time to read;
  end with the approved brand and CTA. Show the user the storyboard and script
  before production. Do not invent proof, metrics, screenshots or output.

## 2. Build from real footage and approved audio

1. Capture the shortest reproducible workflow in a safe local demo. For a CLI
   or API, show an actual command or request and its actual result; don't animate
   fabricated stdout. For a visual product, show the real interface and keep the
   important click and its result in view. Use [Phase 3](phase3.md) for capture and
   redaction. If available, use `liftoff shots plan` to seed the storyboard; review
   each shot rather than treating the generated plan as proof.
2. Run `liftoff video script --json` for the captured assets and installed
   capabilities. Author or edit `.launch/video/script.json` and rerun the command
   to validate it. If `--from-shots` is available, use it only as a starting point.
   Fit the brief to the active script contract, including the end card; don't
   stretch short copy or add unevidenced scenes to fill time.
3. Place the supplied logo in `.launch/media/logo.<ext>` using a
   [supported format](phase4.md). Use the approved brand variant on a background
   where it reads, and verify it actually appears on the end card. A fallback
   monogram or generated logo does not pass the launch check.
4. Prefer an approved recording, split into zero-based scene audio files under
   `.launch/video/vo/` as described in Phase 4. Fit each take to its scene before
   render so speech is not cut off; say the product name correctly. Use TTS only
   if the user approves the provider and content transfer, and never clone a
   voice without consent. No voice is a missing input for a launch cut, not a
   reason to silently ship. Music is optional, licensed, and below speech.
5. Use Remotion for final composition, not a generative model for product proof.
   Follow the [official Remotion skills](https://www.remotion.dev/docs/ai/skills)
   if installed. If approved, generated B-roll can serve as atmosphere, never as
   the source of the logo, product UI, exact text or results. Render only after
   the hold is lifted and the storyboard and required assets are approved.
   Use `liftoff video render --renderer remotion --format 16x9 --json` for web.
   If Remotion isn't available, report the limitation before
   choosing a fallback. Cut other requested sizes to fit rather than cropping
   captions or results.

## 3. Gate the cut before handing it off

- **Brand and evidence:** Verify the real logo, product name and CTA in the
  final frames. Check each claim against the approved evidence and watch the
  before, action and result in sequence. Nothing private may appear in footage
  or narration.
- **Readable with sound off:** Check the opening, busiest action, payoff and end
  card at phone size in every delivered aspect ratio. Keep text inside safe
  areas and use a stable backing over busy footage. For overlays, target
  [4.5:1 normal text and 3:1 large text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  against the actual background. Verify terminal output and product labels are
  readable without pausing. Fix and recheck the frames that failed.
- **Audible with sound on:** Check for actual speech throughout the intended
  scenes, clean beginnings and endings, and a clear mix. Review timing and
  spelling of accessibility captions against the final audio. Phase 4's SRT
  can reflect scene overlays rather than spoken dialogue; don't treat a
  caption receipt as evidence that narration was transcribed.
- **Technical and human checks:** Run `liftoff video check --format 16x9 --json`
  (use the same formats that were rendered) and `liftoff media judge --json`
  if available. Video checks save `.launch/video/check.json` with decode/motion,
  black/freeze, reading pace/SRT cue map, no-progress-chrome, end-card, optional
  Whisper word-coverage and loudness gates. Failed gates block; skipped optional
  checks do not. See [phase4.md](phase4.md) for thresholds.
  Machine checks do not replace watching the cut. For a web
  embed, include a branded poster,
  playback controls and a correctly timed WebVTT dialogue track. For muted
  feeds use readable on-frame copy. Block handoff if the logo, voice or
  contrast fails. Use `liftoff review` for approval of the exact files before
  staging them; never publish or send a video without authorization.

## Skill inputs

[Launch Video Craft](https://github.com/jammaru/launch-video-craft) informs the
real-output capture and frame review, including its
[CLI example](https://github.com/jammaru/launch-video-craft/blob/main/skills/launch-video-craft/example-cli.md).
[Every's launch-video workflow](https://github.com/EveryInc/product-launch-video)
informs the early product proof and muted-feed review.
[Memex's production workflow](https://github.com/memex-lab/product-launch-video-skill)
informs storyboard and narration planning. These are references, not additional
installation requirements.
