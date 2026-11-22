---
channel: show-hn
title: "Show HN: Agent Linux, a source-built desktop preview for Apple silicon"
media: []
claims: [preview, mcp, handoff, limits]
link: https://github.com/ADITYADEV4145/AgentLinux
---
I'm sharing my project Agent Linux as a source-built local developer preview for Apple silicon Macs, not a hosted service or downloadable VM image [claim:preview]. The native app is not notarized [claim:preview].

The MCP command connects an agent to an existing local machine; starting the local VM is a separate operation [claim:mcp]. The interactive viewer provides human input on the shared guest desktop [claim:handoff].

This launch kit was assembled on Linux. Its captures show the built CLI's help, not a working Mac VM or a guest agent session. The README does not qualify real ARM64 guest agent runs, and cloud and billing remain development prototypes [claim:limits].

If you're willing to build the preview on a supported Mac, the repository documents the setup. I'd value feedback on the boundary between agent access and human control. Please do not interpret this post as a claim that the desktop workflow was verified in this kit.
