---
channel: reddit
title: "I maintain Agent Linux: looking for feedback on explicit desktop handoff"
subreddit: r/SideProject
selfPromotion: true
media: []
claims: [preview, mcp, handoff, limits]
link: https://github.com/ADITYADEV4145/AgentLinux
---
I maintain Agent Linux, a source-built local developer preview for Apple silicon Macs [claim:preview]. There are no published public binaries or VM images, and the native app is not notarized [claim:preview].

The design keeps starting the local VM separate from connecting through MCP [claim:mcp]. The interactive viewer supports human input on the same guest desktop [claim:handoff].

For this kit I built the host CLI on Linux and captured its help output only. I did not boot a Mac VM or qualify a guest agent session. The README also treats cloud and billing as development prototypes [claim:limits].

What would make the handoff between a person and an agent understandable to you? This is a maintainer draft pending a review of the community's current posting rules, not a report of adoption or launch results.
