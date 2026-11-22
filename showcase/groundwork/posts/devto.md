---
channel: devto
title: "Inspecting an agent's code navigation with GroundWork"
media: [{slot: cover, path: media/images/og.png}]
claims: [navigation, reuse, grounding, runtime]
link: https://github.com/ADITYADEV4145/GroundWork
---
## Start with a definition

I maintain GroundWork, a tool that searches a local code index and prints symbol locations with signatures [claim:navigation]. The useful question for a code change is often where an existing definition lives, rather than how much repository text an agent can read.

The query command calls the index search and formats file locations in its terminal output [claim:navigation]. In this kit I built the CLI and indexed the project's own source, then captured a lookup for findCode. That is a narrow, reproducible demonstration, not evidence about downstream patch quality.

## Keep checks distinct

The stop hook reports duplicated implementations; the standard profile supplies context while strict mode can hold the stop [claim:reuse]. The edit hook checks new calls against source definitions and returns contextual feedback [claim:grounding]. Neither description promises that all defects are found.

## Local data and explicit setup

The tool uses a local repository index; optional embedding setup downloads a model only with explicit consent [claim:runtime]. A team should still inspect the source and decide which feedback belongs in its own review workflow.

I'd welcome concrete examples where finding a matching definition is not enough. This is an unapproved maintainer draft with no launch metrics attached.
