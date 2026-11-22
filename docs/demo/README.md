# Liftoff self-demo

A 57-second, silent, captioned demo made by running Liftoff on its own repository.
Nothing was posted, staged or approved. The only publish invocation is the
approval-denied `publish --dry-run` in the capture manifest.

- [Landscape demo](demo-16x9.mp4): 1280×720
- [Vertical cut](short-9x16.mp4): 720×1280
- [Square cut](square-1x1.mp4): 720×720
- [Poster](poster.png) · [Captions](captions.srt)

All videos are H.264, 12 fps, with burned-in captions and a three-second end card.
Liftoff currently fixes these resolutions; it has no 1920×1080 output option.
Terminal capture fixes the font at 20px. Smaller capture viewports make the
terminal larger in the composition. Python/sed/cut filters summarize actual CLI
outputs and remove absolute paths; they do not manufacture product output.

## Reproduce

Use a **fresh disposable checkout of this branch/commit**, with Node 22+, npm,
Python 3, ffmpeg/ffprobe (libx264 and librsvg), and Chrome/Chromium. Chrome can be
selected with `LIFTOFF_CHROME=/absolute/path/to/chrome`; otherwise Liftoff tries
its installed browsers. Port 3037 must be free. No external API credentials,
Remotion, TTS or research fetch are needed. Package installation needs npm access.

From the repository root, run the exact pipeline recorded in:

```sh
bash docs/demo/reproduce.sh
```

Outputs are in `.launch/video/`. The script refuses to replace existing launch
state. It serves only `.launch/`, bound to loopback, and stops the server on exit.
To replace the checked-in deliverables after inspecting a new render:

```sh
cp .launch/video/demo-16x9.mp4 .launch/video/short-9x16.mp4 .launch/video/square-1x1.mp4 docs/demo/
cp .launch/video/captions.srt .launch/video/poster.png docs/demo/
```

`inputs/` preserves the agent-authored product, brief, local draft, configuration,
shot lists and video script. `published.json` intentionally contains **no posts**.
The sample date is preparation data, not a real publication schedule. Profile
confirmation was explicitly authorized for this self-demo. No approval record is
created. The brief labels its problem statement as positioning, not validated
customer pain. All feature claims cite existing source files.

The first pass uses `shots-bootstrap.yaml` and renders a landscape preview. The
second pass uses `shots.yaml`, whose render scene runs Liftoff's actual video
checker against that preview, then renders all final cuts. The capture scene
really runs `shots --only sources`; the outer capture restores the full manifest.
The preview's render capture is temporarily copied to the media root so that
`video check` can resolve its own scene while `shots` replaces that scene's PNG.
That temporary copy is removed before the final render, preserving terminal
framing from the complete shots manifest.
Generated terminal GIFs are not used as video inputs: these cuts animate real PNG
captures with Liftoff's built-in motion and captions. Renders need not be
byte-identical across browser/font/ffmpeg versions.

## Shown and deliberately omitted

Shown: product problem and sourced Launch Brief → product-source validation →
profile/channel plan → writing brief and passing copy checks → real terminal
capture → checked video → local review with source badges → exact-hash approval
gate → an empty, honest launch-day warroom.

Not shown: external pain research (no permission/fetched evidence), actual human
approval, external launch, real replies, metrics, learned recommendations or a
launch receipt. No launch occurred. `results` correctly rejects collection before
T+1; `learn` and `receipt` require results that do not exist. Fixture testimonials,
customer quotes and fabricated counts were not substituted.

## Review citation display fix

The accompanying small review-page change presents `[claim:id]` as escaped source
badges in titles and bodies. Original Markdown, edit snapshots, post/media hashes
and approval requirements remain unchanged. It does not change publication or
manual export behavior. Regression tests cover citations, no citations, empty
post rejection and HTML-like untrusted citation text.
