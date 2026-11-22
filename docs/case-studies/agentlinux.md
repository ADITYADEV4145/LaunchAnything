# Agent Linux: a launch kit without booting the Mac-only VM

Liftoff ran on a disposable clone of [Agent Linux at `b7c6f02`](https://github.com/ADITYADEV4145/AgentLinux/tree/b7c6f02f20d92acd68258e1ecb15fa3359f8078d), using [Liftoff at `e0f9268`](https://github.com/ADITYADEV4145/LaunchAnything/tree/e0f9268611e75c26a247fe9d9821688590390676) on Ubuntu with Node.js 24, Chrome and FFmpeg. **Zero posts, submissions or scheduled jobs.** No changes were committed or pushed to Agent Linux. This run verified the launch workflow, not the Apple silicon desktop experience.

## What came out

- A repo scan, a four-channel plan, a Markdown and HTML launch brief, and five channel writing briefs. The scan found no app routes, so the kit used terminal captures.
- Four locally checked drafts: a Show HN introduction for the source-built preview, an r/SideProject question about desktop handoff, an X post with an attached image and a DEV walkthrough about the MCP/VM boundary. A fifth draft, for GitHub Releases, stayed out of the review queue because it had no slot in the plan.
- Three terminal captures in PNG and GIF, six social images and a 33-second CLI walkthrough in 16:9, 9:16 and 1:1 with SRT captions. These are captures of the built CLI's help output, not of a running guest desktop or working MCP session.
- A local HTML review page with four exact post-and-media hashes, a readiness report with unpublished waitlist and welcome-email templates, and a separate three-commit changelog and release plan.

From Liftoff's generated launch brief:

> Agent Linux connects an MCP client to an existing machine rather than starting a VM from MCP. `[product.json](product.json#/proofPoints/1)`

The claim came from [`internal/cli/mcp.go`](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/internal/cli/mcp.go) and [`docs/mcp.md`](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/docs/mcp.md). The [README](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/README.md) and [start command](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/internal/cli/start.go) grounded the source-built preview claim; the [viewer code](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/internal/cli/view.go) and [desktop guide](https://github.com/ADITYADEV4145/AgentLinux/blob/b7c6f02f20d92acd68258e1ecb15fa3359f8078d/docs/desktop.md) grounded the handoff claim. The `product.json` link in the brief is local to the generated kit.

## What still took work

The operator read the source, wrote `product.json` and the posts, edited the brief and specified shots and scenes. Building the Agent Linux CLI offline failed because the Go modules were not cached; fetching dependencies let the host CLI build, but Ubuntu still could not exercise the Mac app or boot its VM. The first brief edit lost the required numbered tagline labels; restoring them made the HTML render again. `write` used all five configured channels and `plan` selected four, so review stopped at `github-release: no scheduled row in plan.md`. Moving that draft out of `posts/` and checking only the planned channels let review build. A shallow clone with no release tag also needed fetched history and an explicit commit range to generate the release report.

Pain research was not fetched and the brief reported missing evidence. Readiness stayed at 0/100 with install, demo and main-path evidence unfilled; CLI help is not proof of the Mac workflow. Final `publish --dry-run` stopped at `devto: exact post and media hash not approved (new or edited post)`. No approval, publish receipt or external action followed. T+1 had not arrived, so there were no metrics, reply drafts, lessons or receipt to report. No outreach drafts were made because there was no opted-in contact list.

## Time and commands

- **Measured:** about **2 min 15 sec** from `doctor` to the final release command, including agent edits and retries. The sum of timed CLI invocations was **55.2 sec**, including **22.1 sec** for video. The two repo runs overlapped; the stopwatch did not cover initial Liftoff setup or writing this case study.
- **Manual estimate, not a benchmark:** **60–95 min** for an equivalent CLI-only kit without Liftoff: 15–25 min verifying the preview and platform limits and planning, 20–30 min for the brief and drafts, 20–30 min for capture and multi-format exports, and 5–10 min to assemble and check the review package. No manual control run was measured, and the estimate does not include a Mac VM demo. It is not a measured time-saving claim.

Built Liftoff with `npm ci && npm run build` and the host CLI with `go build -trimpath -o bin/agent-linux ./cmd/agent-linux`. Using `node dist/cli.js --cwd <disposable-clone> --json`, the main path was `doctor` → `init` (test profile: `devtool`) → `scan` → `validate product` → `plan` → `brief` / `validate brief` → `write` → `check` → `shots` → `images` → `video script` / `video --renderer ffmpeg` → `review` → `publish --dry-run`. The run also exercised `prelaunch --init`, `prelaunch`, `results --replies` and `release --from HEAD~3 --to HEAD`. The three captures came from `agent-linux --help`, `agent-linux mcp --help` and `agent-linux view --help`; none starts a machine.
