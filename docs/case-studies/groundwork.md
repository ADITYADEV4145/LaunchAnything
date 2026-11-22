# GroundWork: from a symbol lookup to a launch kit

Liftoff ran on a disposable clone of [GroundWork at `072c9d7`](https://github.com/ADITYADEV4145/GroundWork/tree/072c9d735ec2817d0c75ab41207cc515974eb867), using [Liftoff at `e0f9268`](https://github.com/ADITYADEV4145/LaunchAnything/tree/e0f9268611e75c26a247fe9d9821688590390676) on Ubuntu with Node.js 24, Chrome and FFmpeg. **Zero posts, submissions or scheduled jobs.** No changes were committed or pushed to GroundWork.

## What came out

- A repo scan, a four-channel plan, a Markdown and HTML launch brief, and five channel writing briefs.
- Four locally checked drafts: a Show HN introduction, an r/SideProject discussion, an X post with an attached image and a DEV walkthrough. A fifth draft, for GitHub Releases, stayed out of the review queue because it had no slot in the plan.
- Three terminal captures in PNG and GIF, six social images, and a 33-second terminal walkthrough in 16:9, 9:16 and 1:1 plus SRT captions. The index build and symbol lookup ran against GroundWork's own TypeScript fixture; the third capture showed `verify --help`, not a run of the verifier.
- A local HTML review page with four exact post-and-media hashes, a readiness report with unpublished waitlist and welcome-email templates, and a separate three-commit changelog and release plan.

From Liftoff's generated launch brief:

> GroundWork ranks matching symbols and can show a scoped map. `[product.json](product.json#/proofPoints/0)`

The claim came from [`src/index/navigation.ts`](https://github.com/ADITYADEV4145/GroundWork/blob/072c9d735ec2817d0c75ab41207cc515974eb867/src/index/navigation.ts). The other claims pointed to the [reuse hook](https://github.com/ADITYADEV4145/GroundWork/blob/072c9d735ec2817d0c75ab41207cc515974eb867/src/hooks/handlers/duplicate_gate.ts) and the [call-grounding hook](https://github.com/ADITYADEV4145/GroundWork/blob/072c9d735ec2817d0c75ab41207cc515974eb867/src/hooks/handlers/grounding.ts). The `product.json` link in the brief is local to the generated kit. In the captured lookup, `symbols slug --limit 3` returned `src/utils/text.ts:1  function  slug(text: string): string`.

## What still took work

The operator read the sources, wrote `product.json` and the draft posts, edited the brief and specified the shots and video scenes. The first brief edit dropped the required `Tagline 1:`–`Tagline 3:` labels; restoring them made the HTML render again. `write` used all five configured channels, but `plan` selected four. Review initially stopped at `github-release: no scheduled row in plan.md`; moving that draft out of `posts/` and checking only the planned channels let the review build. The shallow clone had no release tag, so the release report used an explicit commit range after fetching history into the copy.

Pain research was not fetched and the brief reported missing evidence. The readiness audit missed the HTML headline and “Get started” link already in GroundWork's README; its 0/100 score reflects unfilled readiness evidence, not a failed install. The final `publish --dry-run` refused the first unapproved draft: `devto: exact post and media hash not approved (new or edited post)`. No approvals or publish receipts were written. T+1 had not arrived, so there were no metrics, reply drafts, lessons or receipt to report. No outreach drafts were made because there was no opted-in contact list.

## Time and commands

- **Measured:** about **2 min 15 sec** from `doctor` to the final release command, including agent edits and retries. The sum of timed CLI invocations was **55.2 sec**, including **22.0 sec** for video. The two repo runs overlapped; the stopwatch did not cover initial Liftoff setup or writing this case study.
- **Manual estimate, not a benchmark:** **55–85 min** for an equivalent local kit without Liftoff: 10–15 min inspecting sources and planning, 20–30 min for the brief and drafts, 20–30 min for capture and multi-format exports, and 5–10 min to assemble and check the review package. No manual control run was measured, so this is not a measured time-saving claim.

Built Liftoff with `npm ci && npm run build`. Using `node dist/cli.js --cwd <disposable-clone> --json`, the main path was `doctor` → `init` (test profile: `devtool`) → `scan` → `validate product` → `plan` → `brief` / `validate brief` → `write` → `check` → `shots` → `images` → `video script` / `video --renderer ffmpeg` → `review` → `publish --dry-run`. The run also exercised `prelaunch --init`, `prelaunch`, `results --replies` and `release --from HEAD~3 --to HEAD`. To recreate the media, build GroundWork in its copy and capture `gw --root fixtures/ts-app init`, `gw --root fixtures/ts-app symbols slug --limit 3` and `gw verify --help`.
