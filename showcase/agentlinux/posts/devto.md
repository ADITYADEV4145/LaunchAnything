---
channel: devto
title: "Separating VM startup from agent access in Agent Linux"
media: [{slot: cover, path: media/images/og.png}]
claims: [preview, mcp, handoff, limits]
link: https://github.com/ADITYADEV4145/AgentLinux
---
## Define the preview honestly

I maintain Agent Linux. The repository describes a source-built local developer preview for Apple silicon Macs, with no public binaries or published VM images and no notarized native app [claim:preview]. That is a narrower claim than a generally available desktop product.

## Separate lifecycle from connection

The MCP command works with existing local machine state rather than starting the VM itself [claim:mcp]. The source for the command and the MCP guide are the evidence for that boundary [claim:mcp]. Keeping those operations distinct makes the question of who starts a machine explicit.

The interactive viewer supports human input on the shared guest desktop [claim:handoff]. This kit was produced on Linux, so the captures demonstrate the host CLI's documented options, not the Mac viewer's behavior.

## Name what was not verified

I built the CLI and recorded help output without creating a VM. I did not run a guest agent. The README does not qualify real ARM64 guest agent runs or claim that hosted agents such as Devin run inside the VM; cloud and billing are development prototypes [claim:limits].

Before publishing this draft I would want a supported-Mac walkthrough and human approval of the exact copy. There are no launch outcomes or usage metrics to attach. Feedback on the human-control boundary is more useful here than an unsupported performance claim.
